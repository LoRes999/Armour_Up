/**
 * AsyncStorage is a native module, so it has to be mocked before anything
 * imports the store. The package vendors an in-memory implementation but does
 * not register it; that is this file's whole job.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

/**
 * react-native-purchases (RevenueCat) is native as well. Tests run the in-app
 * pretend purchase service (src/purchases.ts chooses it when NODE_ENV is
 * test); this only keeps the SDK's import away from native code.
 */
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    getCustomerInfo: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    presentCodeRedemptionSheet: jest.fn(),
    showManageSubscriptions: jest.fn(),
  },
}));
