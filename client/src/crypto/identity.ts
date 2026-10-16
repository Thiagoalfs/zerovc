import { ensureVodozemacInitialized, Account } from './vodozemac';
import { keyStore } from './keyStore';

export interface DeviceIdentityKeys {
  curve25519: string;
  ed25519: string;
}

export interface UnpublishedKeys {
  oneTimeKeys: Record<string, string>;
  fallbackKey?: Record<string, string>;
}

export class IdentityManager {
  private account: Account | null = null;
  private identityKeys: DeviceIdentityKeys | null = null;

  async init(): Promise<{ keys: DeviceIdentityKeys; isNewAccount: boolean }> {
    await ensureVodozemacInitialized();
    await keyStore.init();

    const storedPickle = await keyStore.retrieveAndDecryptPickle('account', 'primary_account');
    let isNewAccount = false;

    if (storedPickle) {
      this.account = Account.fromPickle(storedPickle);
    } else {
      this.account = new Account();
      this.account.generateFallbackKey();
      isNewAccount = true;
      await this.saveAccountState();
    }

    const rawKeys = JSON.parse(this.account.identityKeys());
    this.identityKeys = {
      curve25519: rawKeys.curve25519,
      ed25519: rawKeys.ed25519
    };

    return { keys: this.identityKeys, isNewAccount };
  }

  getAccount(): Account {
    if (!this.account) throw new Error('Account not initialized');
    return this.account;
  }

  getIdentityKeys(): DeviceIdentityKeys {
    if (!this.identityKeys) throw new Error('Identity keys not available');
    return this.identityKeys;
  }

  async generateOneTimeKeys(count: number = 50): Promise<UnpublishedKeys> {
    const account = this.getAccount();
    account.generateOneTimeKeys(count);

    const otks = JSON.parse(account.oneTimeKeys()).curve25519 || {};
    const fallback = JSON.parse(account.fallbackKey()).curve25519 || {};

    await this.saveAccountState();

    return {
      oneTimeKeys: otks,
      fallbackKey: fallback
    };
  }

  async markKeysPublished(): Promise<void> {
    const account = this.getAccount();
    account.markKeysAsPublished();
    await this.saveAccountState();
  }

  sign(message: string): string {
    const account = this.getAccount();
    return account.sign(message);
  }

  private async saveAccountState(): Promise<void> {
    if (!this.account) return;
    const pickle = this.account.pickle();
    await keyStore.encryptAndStorePickle('account', 'primary_account', pickle, { id: 'primary_account' });
  }
}

export const identityManager = new IdentityManager();
