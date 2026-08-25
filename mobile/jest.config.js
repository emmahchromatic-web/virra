module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.env.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
  moduleNameMapper: {
    '^@/(app/.*)$': '<rootDir>/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@react-native-async-storage/async-storage$': require.resolve('@react-native-async-storage/async-storage/jest/async-storage-mock'),
    '\\.(wav|mp3|m4a)$': '<rootDir>/__mocks__/audioAssetMock.js',
    // Nitro module: resolves its native side at import time, so without this
    // the whole suite fails to load under Jest rather than skipping HealthKit.
    '^@kingstinct/react-native-healthkit$': '<rootDir>/__mocks__/kingstinctHealthkitMock.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
