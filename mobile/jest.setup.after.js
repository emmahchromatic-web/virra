// Runs after the test framework is installed, once per test file.

const { configure } = require('@testing-library/react-native');

/**
 * How long `waitFor`, `findBy*` and friends keep retrying before giving up.
 *
 * The default is one second, which is plenty on an idle machine and not enough
 * on a busy one. Four component suites — Shimmer, VirraAlert, WorkoutPreview and
 * profileIdentityAndDelete — failed intermittently in full parallel runs and
 * passed in isolation, every time because an async state flush took longer than
 * a second while ~100 other suites competed for the same cores.
 *
 * Raising it does not hide a genuine failure: an assertion that is actually
 * wrong still fails, it just takes longer to say so. What it removes is the
 * class of failure where the only thing wrong was the machine being busy.
 *
 * If a test starts taking fifteen seconds to fail, that is the signal to look at
 * the test rather than to raise this again.
 */
configure({ asyncUtilTimeout: 15000 });
