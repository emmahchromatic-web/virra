#!/usr/bin/env python3
"""
frame_screenshots.py  —  Screenshot the Simulator for App Store Connect or marketing

── App Store Connect (raw native-resolution PNG, ready to upload) ────────────
  Boot iPhone 16 Pro Max  (6.9" tier, 1320×2868 — preferred for ASC 2026)
  or iPhone 15 Pro Max    (6.7" tier, 1290×2796 — also accepted),
  navigate to a screen, then:

    python3 tools/frame_screenshots.py --capture dashboard --asc

  Or capture a sequence in one run (prompts you to navigate between screens):

    python3 tools/frame_screenshots.py --asc --screens onboarding,dashboard,training,nutrition,cycle,insights,paywall

  Output: docs/app-store/screenshots/01-{name}.png at the simulator's native size.
  ASC mode skips the frame, the device chrome, and WebP — Apple wants raw PNGs.

── Marketing: capture the Simulator window as-is (chrome included) ──────────
  Navigate the Simulator to a screen, then:

    python3 tools/frame_screenshots.py --capture checklist --window --out-dir images/ --webp

  Uses macOS screencapture to grab the Simulator window including its rendered
  device chrome (Dynamic Island, buttons, bezel). No frame PNG needed.

── Marketing: composite into a downloaded frame PNG ─────────────────────────
  Download a device frame PNG with a TRANSPARENT screen cutout from mockuphone.com
  and save as  tools/frame-dark.png  /  tools/frame-light.png, then:

    python3 tools/frame_screenshots.py --capture checklist --out-dir images/ --webp

── Single-file / batch modes ─────────────────────────────────────────────────
  Single file:
    python3 tools/frame_screenshots.py raw.png --style dark --window --out images/screen-foo.png --webp

  Batch:
    python3 tools/frame_screenshots.py --batch raw/ --out-dir images/ --style dark --webp

Output naming (non-ASC modes):
    dark   →  images/screen-{name}.png
    light  →  images/screen-{name}-light.png

Variant flags:
    --dark-only / --light-only   skip the other appearance (default captures both)
    --asc                        ASC-spec PNG; forces dark-only unless --light-only or both passed
    --webp                       also write .webp + 600w variants (ignored in --asc mode)

Requirements:
    pip3 install Pillow
    Xcode command-line tools  (xcrun, used in --capture mode)
"""

import sys
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow not found. Install with:  pip3 install Pillow")

SCRIPT_DIR = Path(__file__).parent


# ── Frame helpers ─────────────────────────────────────────────────────────────

def find_screen_bbox(frame: Image.Image):
    """
    Return (left, top, right, bottom) of the transparent screen cutout in the frame.
    Raises ValueError if no transparent region is found.
    """
    if frame.mode != 'RGBA':
        frame = frame.convert('RGBA')
    _, _, _, alpha = frame.split()
    # Transparent pixels (alpha < 30) mark the screen area
    mask = alpha.point(lambda v: 255 if v < 30 else 0)
    bbox = mask.getbbox()
    if not bbox:
        raise ValueError(
            "No transparent screen area found in frame PNG.\n"
            "Make sure you downloaded a frame with a transparent screen cutout."
        )
    return bbox


def composite(screenshot_path: Path, frame_path: Path, output_path: Path):
    """Resize screenshot to fit the frame's transparent cutout, composite, and save."""
    frame = Image.open(frame_path).convert('RGBA')
    screen = Image.open(screenshot_path).convert('RGBA')

    left, top, right, bottom = find_screen_bbox(frame)
    screen_w = right - left
    screen_h = bottom - top

    # Resize screenshot to fill the cutout exactly
    resized = screen.resize((screen_w, screen_h), Image.LANCZOS)

    # Build canvas: screenshot first, then frame on top
    canvas = Image.new('RGBA', frame.size, (0, 0, 0, 0))
    canvas.paste(resized, (left, top))
    canvas.paste(frame, (0, 0), mask=frame)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(str(output_path), 'PNG', optimize=True)
    print(f"  saved  {output_path}")
    return output_path


def resolve_frame(style: str, override: Optional[str]) -> Path:
    """Return the frame PNG path for this style, or raise a helpful error."""
    if override:
        p = Path(override)
        if not p.exists():
            sys.exit(f"Frame not found: {p}")
        return p

    # Look for tools/frame-{style}.png, then tools/frame.png
    for candidate in [
        SCRIPT_DIR / f"frame-{style}.png",
        SCRIPT_DIR / "frame.png",
    ]:
        if candidate.exists():
            return candidate

    sys.exit(
        f"No frame PNG found for style '{style}'.\n"
        f"Download a device frame with a transparent screen cutout from mockuphone.com\n"
        f"and save it as:  {SCRIPT_DIR / f'frame-{style}.png'}"
    )


# ── WebP variants ─────────────────────────────────────────────────────────────

def to_webp(png_path: Path):
    img = Image.open(png_path).convert('RGBA')
    W, H = img.size

    webp = png_path.with_suffix('.webp')
    img.save(str(webp), 'WEBP', quality=88, method=6)
    print(f"  saved  {webp}")

    w600_path = png_path.with_name(f"{png_path.stem}-600w.webp")
    h600 = round(H * 600 / W)
    img.resize((600, h600), Image.LANCZOS).save(str(w600_path), 'WEBP', quality=85, method=6)
    print(f"  saved  {w600_path}")


# ── Simulator helpers ─────────────────────────────────────────────────────────

# Apple-accepted screenshot sizes for App Store Connect, portrait orientation.
# As of 2026 Apple requires ONE of the 6.9" or 6.7" tiers; older tiers are
# accepted in their respective ASC slots but no longer required separately
# because ASC auto-downscales for smaller devices.
ASC_SPEC_SIZES = {
    (1320, 2868): '6.9"  preferred  (iPhone 16 Pro Max)',
    (1290, 2796): '6.7"  accepted   (iPhone 14/15 Pro Max, 15/16 Plus)',
    (1284, 2778): '6.7"  legacy     (iPhone 12/13 Pro Max)',
    (1242, 2688): '6.5"  legacy     (iPhone XS Max, 11 Pro Max)',
}


def _run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Command failed: {' '.join(cmd)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def sim_get_appearance():
    return _run(['xcrun', 'simctl', 'ui', 'booted', 'appearance'])


def sim_set_appearance(mode):
    print(f"  appearance → {mode}")
    _run(['xcrun', 'simctl', 'ui', 'booted', 'appearance', mode])


def sim_screenshot(path: Path):
    _run(['xcrun', 'simctl', 'io', 'booted', 'screenshot', str(path)])


def sim_booted_device_name() -> str:
    """Return the human-readable name of the currently booted simulator."""
    out = _run(['xcrun', 'simctl', 'list', 'devices', 'booted', '--json'])
    import json
    data = json.loads(out)
    for runtime, devices in data.get('devices', {}).items():
        for d in devices:
            if d.get('state') == 'Booted':
                return d.get('name', 'unknown')
    return 'unknown'


def asc_validate(png_path: Path) -> tuple[int, int, str]:
    """
    Open the PNG, return (w, h, label).  Prints a warning if the size is not
    an Apple-accepted App Store Connect screenshot size.
    """
    img = Image.open(str(png_path))
    w, h = img.size
    label = ASC_SPEC_SIZES.get((w, h))
    if label:
        print(f"  ASC ✓  {w}×{h}  {label}")
    else:
        print(
            f"  ASC ✗  {w}×{h} is NOT an accepted App Store Connect size.\n"
            f"     Accepted (portrait): " +
            ', '.join(f"{a}×{b}" for a, b in ASC_SPEC_SIZES)
        )
        print(
            f"     → Boot iPhone 16 Pro Max (preferred) or iPhone 15 Pro Max"
        )
    return w, h, label or 'unaccepted'


_SIM_STATUS_BAR_OVERRIDES = [
    '--time', '9:41',
    '--dataNetwork', 'wifi',
    '--wifiMode', 'active',
    '--wifiBars', '3',
    '--cellularMode', 'active',
    '--cellularBars', '4',
    '--batteryState', 'charged',
    '--batteryLevel', '100',
]


def sim_status_bar_set():
    """Override status bar to canonical screenshot values (9:41, WiFi, 100%)."""
    _run(['xcrun', 'simctl', 'status_bar', 'booted', 'override'] + _SIM_STATUS_BAR_OVERRIDES)
    print("  status bar → 9:41 · WiFi · 100%")


def sim_status_bar_clear():
    """Restore the live status bar."""
    _run(['xcrun', 'simctl', 'status_bar', 'booted', 'clear'])
    print("  status bar restored")


def _sim_window_id() -> int:
    """Return the CGWindowID of the Simulator window via a Swift one-liner."""
    swift = (
        'import Quartz\n'
        'let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]\n'
        'for w in list {\n'
        '    if let owner = w["kCGWindowOwnerName"] as? String, owner == "Simulator",\n'
        '       let wid = w["kCGWindowNumber"] as? Int32 { print(wid); break }\n'
        '}'
    )
    r = subprocess.run(['swift', '-e', swift], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit("Could not find Simulator window. Is the Simulator running?")
    return int(r.stdout.strip())


def _crop_to_device(img: Image.Image) -> Image.Image:
    """
    Remove the Simulator toolbar and crop to the phone device.

    Pass 1 — toolbar end.
      Scan the centre column from row 50 downward. The toolbar has a uniform
      colour; require 3 consecutive rows that differ by > 20 to mark the end.
      Centre-column detection is immune to the window corner-rounding artefact
      that fools left-edge comparisons.

    Pass 2 — phone bounding box.
      Sample the Simulator background from the far-left column at mid-image
      (always outside the phone). Build a mask of pixels that differ from that
      background by > 10, then take column/row sums to find L/R/bottom bounds.
      TOP is set to toolbar_end directly — no row-count check — so the Dynamic
      Island and outer bezel rows (which can be all-black) are included.
    """
    gray = img.convert('L')
    w, h = gray.size
    data = list(gray.getdata())

    def p(x, y):
        return data[y * w + x]

    # ── Pass 1: centre-column toolbar detection ───────────────────────────────
    toolbar_color = p(w // 2, 50)
    toolbar_end = h // 4   # fallback if no transition found
    consec = 0
    first_diff = None
    for y in range(50, h // 3):
        if abs(int(p(w // 2, y)) - int(toolbar_color)) > 20:
            if first_diff is None:
                first_diff = y
            consec += 1
            if consec >= 3:
                toolbar_end = first_diff
                break
        else:
            consec = 0
            first_diff = None

    # ── Pass 2: phone bounding box ────────────────────────────────────────────
    bg = p(5, h * 2 // 3)   # background colour: left edge (outside phone), mid-image

    sub_data = data[toolbar_end * w:]
    sub_h = h - toolbar_end
    mask = [1 if abs(int(v) - int(bg)) > 10 else 0 for v in sub_data]

    # Column sums and row sums over the sub-image
    col_sums = [sum(mask[x::w]) for x in range(w)]
    row_sums = [sum(mask[y * w:(y + 1) * w]) for y in range(sub_h)]

    left_x = next((x for x, c in enumerate(col_sums) if c > 0), 0)
    right_x = next((x for x in range(w - 1, left_x, -1) if col_sums[x] > 0), w - 1)
    bottom_y = next((y for y in range(sub_h - 1, -1, -1) if row_sums[y] > 0), sub_h - 1)

    pad_tb = 8    # top / bottom
    pad_lr = 28   # left / right — buttons protrude beyond the bezel
    return img.crop((
        max(0, left_x - pad_lr),
        max(0, toolbar_end),              # top = toolbar end; no padding to avoid toolbar rows
        min(w, right_x + pad_lr),
        min(h, toolbar_end + bottom_y + pad_tb),
    ))


def capture_sim_window(output_path: Path):
    """
    Capture the Simulator window as displayed on screen — device chrome included.
    Requires Screen Recording permission for Terminal (or whatever runs this script):
      System Settings → Privacy & Security → Screen Recording → enable Terminal
    """
    # Bring Simulator to front and restore from dock/minimised state
    subprocess.run(
        ['osascript', '-e', 'tell application "Simulator" to activate'],
        capture_output=True
    )
    time.sleep(0.4)  # wait for window to fully restore

    wid = _sim_window_id()
    # -l = specific window, -o = no drop shadow, -x = no shutter sound
    r = subprocess.run(['screencapture', '-l', str(wid), '-o', '-x', str(output_path)],
                       capture_output=True, text=True)
    if r.returncode != 0 or not output_path.exists():
        sys.exit(
            "screencapture failed — Screen Recording permission is required.\n\n"
            "  System Settings → Privacy & Security → Screen Recording\n"
            "  → enable Terminal (or the app running this script)\n\n"
            "Then re-run this command."
        )

    # Crop out the Simulator toolbar — keep only the phone device itself
    img = Image.open(str(output_path))
    cropped = _crop_to_device(img)
    cropped.save(str(output_path), 'PNG', optimize=True)
    print(f"  captured simulator window  (window id {wid})")


# ── Capture mode ──────────────────────────────────────────────────────────────

def _styles_to_capture(asc: bool, dark_only: bool, light_only: bool) -> tuple[str, ...]:
    if dark_only and light_only:
        sys.exit("--dark-only and --light-only are mutually exclusive")
    if dark_only:    return ('dark',)
    if light_only:   return ('light',)
    if asc:          return ('dark',)        # Virra ships dark by default
    return ('dark', 'light')


def capture_and_frame(name: str, out_dir: Path, webp: bool, delay: float,
                      frame_override: Optional[str], use_window: bool,
                      asc: bool, dark_only: bool, light_only: bool,
                      filename_prefix: str = ''):
    # Bring Simulator to front before doing anything — avoids screencapture failure
    # if the window is minimised or on a different Space.
    if use_window:
        subprocess.run(['osascript', '-e', 'tell application "Simulator" to activate'],
                       capture_output=True)
        time.sleep(0.8)

    original = sim_get_appearance()
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Current appearance: {original}  (restored after capture)")

    if asc:
        # ASC filenames don't get a -light suffix; we run dark-only by default.
        outputs = {
            'dark':  out_dir / f"{filename_prefix}{name}.png",
            'light': out_dir / f"{filename_prefix}{name}-light.png",
        }
    else:
        outputs = {
            'dark':  out_dir / f"screen-{name}.png",
            'light': out_dir / f"screen-{name}-light.png",
        }

    sim_status_bar_set()

    try:
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            for style in _styles_to_capture(asc, dark_only, light_only):
                print(f"── {style} ──────────────")
                sim_set_appearance(style)
                print(f"  waiting {delay}s for transition…")
                time.sleep(delay)

                raw = tmp / f"{name}-{style}.png"

                if asc:
                    # Raw simctl screenshot at native device resolution. No
                    # frame, no chrome — this is what App Store Connect wants.
                    sim_screenshot(raw)
                    import shutil
                    shutil.copy(raw, outputs[style])
                    print(f"  saved  {outputs[style]}")
                    asc_validate(outputs[style])
                elif use_window:
                    capture_sim_window(raw)
                    import shutil
                    shutil.copy(raw, outputs[style])
                    print(f"  saved  {outputs[style]}")
                else:
                    sim_screenshot(raw)
                    print(f"  captured raw screenshot")
                    frame_path = resolve_frame(style, frame_override)
                    composite(raw, frame_path, outputs[style])

                # ASC PNGs must stay PNG — no WebP variants
                if webp and not asc:
                    to_webp(outputs[style])
    finally:
        print(f"\n── restoring ──")
        sim_set_appearance(original)
        sim_status_bar_clear()


def capture_screens_sequence(screens: list[str], out_dir: Path, asc: bool,
                             webp: bool, delay: float, frame_override: Optional[str],
                             use_window: bool, dark_only: bool, light_only: bool):
    """
    Capture a sequence of named screens. Prompts the user to navigate the
    Simulator to each screen before pressing Enter. In ASC mode, filenames
    are numbered (01-foo.png, 02-bar.png) so the upload order is deterministic.
    """
    device = sim_booted_device_name()
    print(f"\nBooted simulator: {device}")
    print(f"Output directory:  {out_dir}")
    print(f"Screens to capture: {', '.join(screens)}")
    if asc:
        print("Mode: ASC (raw native-resolution PNG, dark appearance)")
    print()

    for idx, screen in enumerate(screens, start=1):
        prefix = f"{idx:02d}-" if asc else ''
        print(f"━━━ {idx}/{len(screens)}  {screen}  ━━━")
        try:
            input(f"Navigate the simulator to the {screen} screen, then press Enter… ")
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            return
        capture_and_frame(
            name=screen, out_dir=out_dir, webp=webp, delay=delay,
            frame_override=frame_override, use_window=use_window,
            asc=asc, dark_only=dark_only, light_only=light_only,
            filename_prefix=prefix,
        )
        print()

    print("All screens captured.")
    if asc:
        print(f"\nUpload from: {out_dir.resolve()}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description='Capture Simulator screenshots for App Store Connect or marketing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument('--capture', metavar='NAME',
                   help='Screen name (e.g. dashboard). Simulator must be open on that screen.')
    p.add_argument('--screens', metavar='LIST',
                   help='Comma-separated list of screens to capture in sequence. '
                        'Script prompts you to navigate between each.')
    p.add_argument('--asc', action='store_true',
                   help='App Store Connect mode: raw native-resolution PNG, no frame, '
                        'no chrome, no WebP. Default output: docs/app-store/screenshots/')
    p.add_argument('--window', action='store_true',
                   help='Capture the Simulator window as-is (device chrome included). '
                        'Marketing mode — no frame PNG needed.')
    p.add_argument('--frame', metavar='PATH',
                   help='Override frame PNG path (default: tools/frame-{style}.png)')
    p.add_argument('--delay', type=float, default=0.8, metavar='SECS',
                   help='Seconds to wait after toggling appearance (default: 0.8)')

    p.add_argument('--dark-only',  action='store_true', help='Skip the light-mode capture')
    p.add_argument('--light-only', action='store_true', help='Skip the dark-mode capture')

    p.add_argument('input', nargs='?', help='Input PNG screenshot (compositing mode)')
    p.add_argument('--style', choices=['dark', 'light'], default='dark')
    p.add_argument('--out', metavar='PATH', help='Output path')

    p.add_argument('--batch', metavar='DIR', help='Process all PNGs in DIR')
    p.add_argument('--out-dir', metavar='DIR', help='Output directory')
    p.add_argument('--webp', action='store_true',
                   help='Also generate .webp and -600w.webp variants (ignored in --asc mode)')

    args = p.parse_args()

    # Resolve default output directory based on mode
    if args.out_dir:
        default_out = Path(args.out_dir)
    elif args.asc:
        default_out = Path('docs/app-store/screenshots')
    else:
        default_out = Path('images')

    if args.screens:
        screens = [s.strip() for s in args.screens.split(',') if s.strip()]
        if not screens:
            sys.exit("--screens received an empty list")
        capture_screens_sequence(
            screens=screens, out_dir=default_out, asc=args.asc,
            webp=args.webp, delay=args.delay, frame_override=args.frame,
            use_window=args.window, dark_only=args.dark_only, light_only=args.light_only,
        )

    elif args.capture:
        capture_and_frame(
            name=args.capture, out_dir=default_out, webp=args.webp, delay=args.delay,
            frame_override=args.frame, use_window=args.window, asc=args.asc,
            dark_only=args.dark_only, light_only=args.light_only,
        )

    elif args.batch:
        src = Path(args.batch)
        out_dir = Path(args.out_dir) if args.out_dir else src
        frame_path = resolve_frame(args.style, args.frame)
        pngs = sorted(src.glob('*.png'))
        if not pngs:
            sys.exit(f"No PNG files found in {src}")
        for png in pngs:
            name = png.stem.removeprefix('raw-')
            suffix = '' if args.style == 'dark' else f'-{args.style}'
            out = out_dir / f"screen-{name}{suffix}.png"
            print(f"\n{png.name}  →  {out.name}")
            framed = composite(png, frame_path, out)
            if args.webp:
                to_webp(framed)

    elif args.input:
        inp = Path(args.input)
        frame_path = resolve_frame(args.style, args.frame)
        out = Path(args.out) if args.out else inp.parent / f"{inp.stem}-framed-{args.style}.png"
        print(f"\n{inp.name}  →  {out.name}")
        framed = composite(inp, frame_path, out)
        if args.webp:
            to_webp(framed)

    else:
        p.print_help()


if __name__ == '__main__':
    main()
