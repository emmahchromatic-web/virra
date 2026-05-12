import ExpoModulesCore
import HealthKit

public class MenstrualHealthModule: Module {
  private let store = HKHealthStore()
  private let menstrualType = HKObjectType.categoryType(forIdentifier: .menstrualFlow)!

  public func definition() -> ModuleDefinition {
    Name("MenstrualHealth")

    // Request read + write permission for menstrual flow
    AsyncFunction("requestPermission") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      self.store.requestAuthorization(
        toShare: [self.menstrualType],
        read:    [self.menstrualType]
      ) { success, _ in
        promise.resolve(success)
      }
    }

    // Return ISO date strings for up to the last 6 period start dates
    // (allows estimateCycleLength to compute an average from multiple cycles)
    AsyncFunction("getRecentPeriodStarts") { (promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve([String]())
        return
      }
      let sixMonthsAgo = Calendar.current.date(byAdding: .month, value: -6, to: Date())!
      let predicate    = HKQuery.predicateForSamples(withStart: sixMonthsAgo, end: nil)
      let sortDesc     = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

      let query = HKSampleQuery(
        sampleType: self.menstrualType,
        predicate:  predicate,
        limit:      HKObjectQueryNoLimit,
        sortDescriptors: [sortDesc]
      ) { _, samples, _ in
        guard let samples = samples as? [HKCategorySample] else {
          promise.resolve([String]())
          return
        }
        // Filter out "none" flow values (cycle tracking apps sometimes log these)
        let flowSamples = samples.filter { $0.value != HKCategoryValueMenstrualFlow.none.rawValue }
        // Identify period starts: a sample whose start date is >3 days after the previous sample
        var starts: [Date] = []
        var lastDate: Date? = nil
        for sample in flowSamples {
          if let prev = lastDate {
            let gap = sample.startDate.timeIntervalSince(prev) / 86400
            if gap > 3 { starts.append(sample.startDate) }
          } else {
            starts.append(sample.startDate) // first sample ever
          }
          lastDate = sample.startDate
        }
        let formatter = ISO8601DateFormatter()
        let isoStrings = starts.suffix(6).map { formatter.string(from: $0) }
        promise.resolve(isoStrings)
      }
      self.store.execute(query)
    }

    // Write a menstrual flow (medium) sample to HealthKit for the given ISO date
    AsyncFunction("logPeriodStart") { (isoDate: String, promise: Promise) in
      guard HKHealthStore.isHealthDataAvailable() else {
        promise.resolve(false)
        return
      }
      let formatter = ISO8601DateFormatter()
      formatter.formatOptions = [.withFullDate, .withDashSeparatorInDate]
      guard let date = formatter.date(from: isoDate) ?? ISO8601DateFormatter().date(from: isoDate) else {
        promise.resolve(false)
        return
      }
      let sample = HKCategorySample(
        type:  self.menstrualType,
        value: HKCategoryValueMenstrualFlow.medium.rawValue,
        start: date,
        end:   date.addingTimeInterval(86400)
      )
      self.store.save(sample) { success, _ in promise.resolve(success) }
    }
  }
}
