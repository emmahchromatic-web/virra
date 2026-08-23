// expo-audio's native AudioModule isn't present under jest, so importing the
// real package throws on load. The rest chime only uses these two entry points.
module.exports = {
  createAudioPlayer: jest.fn(() => ({
    play:   jest.fn(),
    pause:  jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
};
