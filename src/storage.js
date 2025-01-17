/**
 * Copyright (c) Hathor Labs and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import CryptoJS from 'crypto-js';
import { LevelDBStore, Storage, walletUtils, config, network, cryptoUtils, WalletType } from "@hathor/wallet-lib";
import { VERSION } from "./constants";


export const WALLET_VERSION_KEY = 'localstorage:version';
// This key holds the storage version to indicate the migration strategy
export const STORE_VERSION_KEY = 'localstorage:storeversion';
export const LEDGER_APP_VERSION_KEY = 'localstorage:ledger:version';
// This marks the wallet as being manually locked
export const LOCKED_KEY = 'localstorage:lock';
// This key marks the wallet as being correctly closed
export const CLOSED_KEY = 'localstorage:closed';
// This key marks that the user has seen the welcome page and clicked on get started
export const STARTED_KEY = 'localstorage:started';
export const NETWORK_KEY = 'localstorage:network';
export const IS_HARDWARE_KEY = 'localstorage:ishardware';
export const TOKEN_SIGNATURES_KEY = 'localstorage:token:signatures';
export const IS_BACKUP_DONE_KEY = 'localstorage:backup';
export const SERVER_KEY = 'localstorage:server';
export const WS_SERVER_KEY = 'localstorage:wsserver';

export const storageKeys = [
  WALLET_VERSION_KEY,
  STORE_VERSION_KEY,
  LOCKED_KEY,
  CLOSED_KEY,
  STARTED_KEY,
  NETWORK_KEY,
  IS_HARDWARE_KEY,
  TOKEN_SIGNATURES_KEY,
  IS_BACKUP_DONE_KEY,
  SERVER_KEY,
  WS_SERVER_KEY,
];

export class LocalStorageStore {
  _storage = null;

  version = 1;

  getItem(key) {
    let item;
    try {
      item = localStorage.getItem(key);
      return JSON.parse(item);
    } catch (e) {
      // old versions of the wallet would save strings without converting
      // to JSON, so we catch this exception here and return the string directly
      // FIXME this is a temporary solution and should be fixed by versioning
      // the storage: https://github.com/HathorNetwork/hathor-wallet-lib/issues/19
      if (e instanceof SyntaxError) {
        // first save in JSON format
        this.setItem(key, item);
        // return it
        return item;
      }
      throw e;
    }
  }

  setItem(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  clear() {
    localStorage.clear();
  }

  getWalletId() {
    return this.getItem('wallet:id');
  }

  /**
   * Check if the wallet is loaded, it does not check the access data in storage since it requires
   * an async call, so we only check the wallet id.
   * We also check the 'wallet:accessData' key used on old versions of the lib so we can start the
   * wallet and finish the migration process, this key is deleted during the migration process so
   * this check will not be needed after all wallets have migrated.
   *
   * @return {boolean} Whether the wallet is loaded
   */
  isLoadedSync() {
    return (!!this.getWalletId()) || (!!this.getItem('wallet:accessData'))
  }

  setWalletId(walletId) {
    this.setItem('wallet:id', walletId);
  }

  cleanWallet() {
    this.removeItem('wallet:id');
    this.removeItem(IS_HARDWARE_KEY);
    this.removeItem(CLOSED_KEY);
    delete this._storage;
    this._storage = null;
  }

  resetStorage() {
    this.removeItem('wallet:id');

    for (const key of storageKeys) {
      this.removeItem(key);
    }
  }

  async initStorage(seed, password, pin, passphrase='') {
    this._storage = null;
    this.setHardwareWallet(false);
    const accessData = walletUtils.generateAccessDataFromSeed(
      seed,
      {
        pin,
        passphrase,
        password,
        networkName: config.getNetwork().name,
      }
    );
    const walletId = walletUtils.getWalletIdFromXPub(accessData.xpubkey);
    this.setWalletId(walletId);
    const storage = this.getStorage();
    await storage.saveAccessData(accessData);
    this._storage = storage;
    this.updateStorageVersion();
    return storage;
  }

  async initHWStorage(xpub) {
    this._storage = null;
    this.setHardwareWallet(true);
    const accessData = walletUtils.generateAccessDataFromXpub(
      xpub,
      { hardware: true }
    );
    const walletId = walletUtils.getWalletIdFromXPub(accessData.xpubkey);
    this.setWalletId(walletId);
    const storage = this.getStorage();
    await storage.saveAccessData(accessData);
    this._storage = storage;
    this.updateStorageVersion();
    return storage;
  }

  /**
   * Get a Storage instance for the loaded wallet.
   * @returns {Storage|null} Storage instance if the wallet is loaded.
   */
  getStorage() {
    if (!this._storage) {
      const walletId = this.getWalletId();
      if (!walletId) {
        return null;
      }

      const store = new LevelDBStore(walletId);
      this._storage = new Storage(store);
    }
    return this._storage;
  }

  /**
   * Get access data of loaded wallet from async storage.
   *
   * @returns {Promise<IWalletAccessData|null>}
   */
  async _getAccessData() {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }
    return storage.getAccessData();
  }

  /**
   * Will attempt to load the access data from either the old or new storage.
   * This will return the access data as it was found, so the format will be different.
   * To check which format was received, use the storage version that is returned.
   *
   * @returns {Promise<{
   *  accessData: IWalletAccessData|null,
   *  version: number,
   *  }>} The access data and the storage version.
   */
  async getAvailableAccessData() {
   // First we try to fetch the old access data (if we haven't migrated yet)
   let accessData = this.getItem('wallet:accessData');
   if (!accessData) {
     // If we don't have the old access data, we try to fetch the new one
     accessData = await this._getAccessData();
   }

   return accessData;
 }

  /**
   * Check if the wallet is loaded.
   * Only works after preload is called and hathorMemoryStorage is populated.
   *
   * @returns {Promise<boolean>} Whether we have a loaded wallet on the storage.
   */
  async isLoaded() {
    const accessData = await this.getAvailableAccessData();
    return !!accessData;
  }

  /**
   * Get the storage version.
   * @returns {number|null} Storage version if it exists on AsyncStorage.
   */
  getStorageVersion() {
    return this.getItem(STORE_VERSION_KEY);
  }

  /**
   * Update the storage version to the most recent one.
   */
  updateStorageVersion() {
    this.setItem(STORE_VERSION_KEY, this.version);
  }

  getOldWalletWords(password) {
    const accessData = this.getItem('wallet:accessData');
    if (!accessData) {
      return null;
    }

    const decryptedWords = CryptoJS.AES.decrypt(accessData.words, password);
    return decryptedWords.toString(CryptoJS.enc.Utf8);
  }

  async getWalletWords(password) {
    const storage = this.getStorage();
    if (!storage) {
      throw new Error('Cannot get words from uninitialized wallet');
    }

    const data = await storage.getAccessData();
    return cryptoUtils.decryptData(data.words, password);
  }

  /**
   * Migrate registered tokens from the old storage into the new storage
   * The old storage holds an array of token data and the new storage expects
   * an object with the key as uid and value as token data.
   *
   * @async
   */
  async handleMigrationOldRegisteredTokens(storage) {
    const oldTokens = this.getItem('wallet:tokens');
    if (!oldTokens) {
      return;
    }
    for (const token of oldTokens) {
      await storage.registerToken(token);
    }
  }

  /**
   * Handle data migration from old versions of the wallet to the most recent and usable
   *
   * @param {String} pin Unlock PIN written by the user
   * @async
   */
  async handleDataMigration(pin) {
    const storageVersion = this.getStorageVersion();
    if (storageVersion === null) {
      // We are migrating from an version of wallet-lib prior to 1.0.0
      // This will generate the encrypted keys and other metadata
      const accessData = this.migrateAccessData(pin);
      // Prepare the storage with the migrated access data
      this._storage = null;
      this.setHardwareWallet(false);
      const walletId = walletUtils.getWalletIdFromXPub(accessData.xpubkey);
      this.setWalletId(walletId);
      const storage = this.getStorage();
      await storage.saveAccessData(accessData);
      this._storage = storage;

      await this.handleMigrationOldRegisteredTokens(storage);
      const isBackupDone = this.getItem('wallet:backup');
      if (isBackupDone) {
        this.markBackupDone();
      }

      // The access data is saved on the new storage, we can delete the old data.
      // This will only delete keys with the wallet prefix
      for (const key of Object.keys(localStorage)) {
        if (key === 'wallet:id') continue;
        if (key.startsWith('wallet:')) {
          localStorage.removeItem(key);
        }
      }
    }
    // We have finished the migration so we can set the storage version to the most recent one.
    this.updateStorageVersion();
  }

  migrateAccessData(pin) {
    const oldAccessData = this.getItem('wallet:accessData');
    let acctPathKey;
    let authKey;
    if (oldAccessData.acctPathMainKey) {
      const decryptedAcctKey = CryptoJS.AES.decrypt(oldAccessData.acctPathMainKey, pin);
      const acctKeyStr = decryptedAcctKey.toString(CryptoJS.enc.Utf8);
      acctPathKey = cryptoUtils.encryptData(acctKeyStr, pin);
    }
    if (oldAccessData.authKey) {
      const decryptedAuthKey = CryptoJS.AES.decrypt(oldAccessData.authKey, pin);
      const authKeyStr = decryptedAuthKey.toString(CryptoJS.enc.Utf8);
      authKey = cryptoUtils.encryptData(authKeyStr, pin);
    }

    return {
      walletType: WalletType.P2PKH,
      walletFlags: 0,
      xpubkey: oldAccessData.xpubkey,
      acctPathKey,
      authKey,
      words: {
        data: oldAccessData.words,
        hash: oldAccessData.hashPasswd,
        salt: oldAccessData.saltPasswd,
        iterations: oldAccessData.hashIterations,
        pbkdf2Hasher: oldAccessData.pbkdf2Hasher,
      },
      mainKey: {
        data: oldAccessData.mainKey,
        hash: oldAccessData.hash,
        salt: oldAccessData.salt,
        iterations: oldAccessData.hashIterations,
        pbkdf2Hasher: oldAccessData.pbkdf2Hasher,
      },
    };
  }

  async checkPin(pinCode) {
    const accessData = await this.getAvailableAccessData();
    let mainEncryptedData = accessData.mainKey;
    if (!mainEncryptedData.data) {
      // Old storage
      mainEncryptedData = {
        data: accessData.mainKey,
        hash: accessData.hash,
        salt: accessData.salt,
        iterations: accessData.hashIterations,
        pbkdf2Hasher: accessData.pbkdf2Hasher,
      };
    }

    return cryptoUtils.checkPassword(mainEncryptedData, pinCode);
  }

  /**
   * Persist server URLs on the localStorage.
   * @param {string} serverURL Fullnode api url
   * @param {string} wsServerURL websocket server url for wallet-service
   */
  setServers(serverURL, wsServerURL) {
    this.setItem(SERVER_KEY, serverURL);
    if (wsServerURL) {
      this.setItem(WS_SERVER_KEY, serverURL);
    }
  }

  getServer() {
    return this.getItem(SERVER_KEY);
  }

  getWsServer() {
    return this.getItem(WS_SERVER_KEY);
  }

  lock() {
    this.setItem(LOCKED_KEY, true);
  }

  unlock() {
    this.setItem(LOCKED_KEY, false);
  }

  isLocked() {
    return this.getItem(LOCKED_KEY) ?? true;
  }

  close() {
    this.setItem(CLOSED_KEY, true);
  }

  wasClosed() {
    return this.getItem(CLOSED_KEY) || false;
  }

  open() {
    this.setItem(CLOSED_KEY, false);
  }

  wasStarted() {
    return this.getItem(STARTED_KEY);
  }

  markWalletAsStarted() {
    this.setItem(STARTED_KEY, true);
  }

  getWalletVersion() {
    return this.getItem(WALLET_VERSION_KEY);
  }

  setWalletVersion() {
    this.setItem(WALLET_VERSION_KEY, VERSION);
  }

  setNetwork(networkName) {
    this.setItem(NETWORK_KEY, networkName);
    network.setNetwork(networkName);
  }

  getNetwork() {
    return this.getItem(NETWORK_KEY);
  }

  setHardwareWallet(value) {
    this.setItem(IS_HARDWARE_KEY, value);
  }

  isHardwareWallet() {
    return this.getItem(IS_HARDWARE_KEY) || false;
  }

  getTokenSignatures() {
    return this.getItem(TOKEN_SIGNATURES_KEY) || {};
  }

  setTokenSignatures(data) {
    this.setItem(TOKEN_SIGNATURES_KEY, data);
  }

  resetTokenSignatures() {
    this.removeItem(TOKEN_SIGNATURES_KEY);
  }

  markBackupDone() {
    this.setItem(IS_BACKUP_DONE_KEY, true);
  }

  markBackupAsNotDone() {
    this.removeItem(IS_BACKUP_DONE_KEY);
  }

  isBackupDone() {
    return !!this.getItem(IS_BACKUP_DONE_KEY)
  }

  saveLedgerAppVersion(version) {
    this.setItem(LEDGER_APP_VERSION_KEY, version);
  }

  getLedgerAppVersion() {
    return this.getItem(LEDGER_APP_VERSION_KEY);
  }
}

export default new LocalStorageStore();
