module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.env.js'],
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/jest.setup.after.js',
  ],
  /**
   * Jest kills an individual test at this point, whatever it is waiting for.
   *
   * It has to sit ABOVE the react-native-testing-library `asyncUtilTimeout` in
   * jest.setup.after.js, or that setting cannot do its job: a `waitFor` given a
   * fifteen-second budget was still being killed at five, so raising the one
   * without the other achieved nothing. They are a pair.
   */
  testTimeout: 30000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg)'
  ],
  moduleNameMapper: {
    '^@/(app/.*)$': '<rootDir>/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@react-native-async-storage/async-storage$': require.resolve('@react-native-async-storage/async-storage/jest/async-storage-mock'),
    '\\.(wav|mp3|m4a)$': '<rootDir>/__mocks__/audioAssetMock.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
