// Jest stand-in for @kingstinct/react-native-healthkit.
//
// The real package is a Nitro module: it resolves its native side at import
// time and throws "Failed to get NitroModules" under Jest, which has no native
// runtime, so the whole suite fails to load rather than just skipping HealthKit.
// Same class of problem as expo-audio needing __mocks__/expo-audio.js.
//
// Every function resolves empty, which is exactly the shape healthKitBridge
// already treats as "HealthKit has nothing for us". Tests that care about
// specific samples mock the bridge itself, not this.
module.exports = {
  isHealthDataAvailable:         () => false,
  requestAuthorization:          async () => false,
  queryQuantitySamples:          async () => [],
  queryCategorySamples:          async () => [],
  queryStatisticsForQuantity:    async () => ({}),
  queryWorkoutSamples:           async () => [],
  queryWorkoutSamplesWithAnchor: async () => ({ samples: [], deletedSamples: [], newAnchor: '' }),
  saveWorkoutSample:             async () => ({}),
  saveQuantitySample:            async () => true,
};
