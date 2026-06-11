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
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ]
};
