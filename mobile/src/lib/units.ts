import AsyncStorage from '@react-native-async-storage/async-storage';

export type UnitSystem = 'metric' | 'imperial';

const KEY = 'virra:unit_system';

export async function getUnitSystem(): Promise<UnitSystem> {
  const val = await AsyncStorage.getItem(KEY);
  return (val as UnitSystem) ?? 'metric';
}

export async function setUnitSystem(system: UnitSystem): Promise<void> {
  await AsyncStorage.setItem(KEY, system);
}
