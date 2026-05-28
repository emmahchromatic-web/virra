import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorageAdapter } from '@/store/persistAdapter';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('asyncStorageAdapter', () => {
  it('round-trips a JSON payload', async () => {
    await asyncStorageAdapter.setItem('virra:test', '{"a":1}');
    const got = await asyncStorageAdapter.getItem('virra:test');
    expect(got).toBe('{"a":1}');
  });

  it('returns null for missing keys', async () => {
    const got = await asyncStorageAdapter.getItem('virra:absent');
    expect(got).toBeNull();
  });

  it('removes a key', async () => {
    await asyncStorageAdapter.setItem('virra:test', 'x');
    await asyncStorageAdapter.removeItem('virra:test');
    expect(await asyncStorageAdapter.getItem('virra:test')).toBeNull();
  });
});
