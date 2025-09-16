/**
 * PumpFun Token Creation Service
 * Handles token creation using PumpFun API with Jito bundling support
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { TokenMetaDataType } from './types';

// PumpFun Program Addresses and Configuration
export const PUMPFUN_CONFIG = {
  mainnet: {
    program: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    api: {
      trade: 'https://pumpportal.fun/api/trade',
      tradeLocal: 'https://pumpportal.fun/api/trade-local',
      ipfs: 'https://pump.fun/api/ipfs'
    },
    jito: {
      blockEngine: 'https://mainnet.block-engine.jito.wtf',
      bundleEndpoint: 'https://mainnet.block-engine.jito.wtf/api/v1/bundles'
    }
  },
  testnet: {
    program: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    api: {
      trade: 'https://pumpportal.fun/api/trade',
      tradeLocal: 'https://pumpportal.fun/api/trade-local',
      ipfs: 'https://pump.fun/api/ipfs'
    },
    jito: {
      blockEngine: 'https://testnet.block-engine.jito.wtf',
      bundleEndpoint: 'https://testnet.block-engine.jito.wtf/api/v1/bundles'
    }
  }
} as const;

export interface PumpFunTokenCreationOptions {
  tokenMetadata: TokenMetaDataType;
  network: 'mainnet' | 'testnet';
  devBuyAmount?: number;
  slippage?: number;
  priorityFee?: number;
  useJitoBundling?: boolean;
  apiKey?: string;
  imageFile?: File | Blob;
}

export interface PumpFunMetadataUpload {
  file: File | Blob;
  name: string;
  symbol: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface PumpFunMetadataResponse {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

export class PumpFunService {
  private connection: Connection;
  private network: 'mainnet' | 'testnet';
  private config: typeof PUMPFUN_CONFIG.mainnet | typeof PUMPFUN_CONFIG.testnet;

  constructor(connection: Connection, network: 'mainnet' | 'testnet' = 'mainnet') {
    this.connection = connection;
    this.network = network;
    this.config = PUMPFUN_CONFIG[network];
  }

  async uploadMetadata(metadata: PumpFunMetadataUpload): Promise<{
    metadataUri: string;
    metadata: PumpFunMetadataResponse;
  }> {
    const formData = new FormData();
    formData.append('file', metadata.file);
    formData.append('name', metadata.name);
    formData.append('symbol', metadata.symbol);
    formData.append('description', metadata.description);
    formData.append('twitter', metadata.twitter || '');
    formData.append('telegram', metadata.telegram || '');
    formData.append('website', metadata.website || '');
    formData.append('showName', 'true');

    const response = await fetch(this.config.api.ipfs, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload metadata: ${response.statusText}`);
    }

    return await response.json();
  }

  async createTokenLocal(
    options: PumpFunTokenCreationOptions,
    mintKeypair: Keypair,
    signerKeypair: Keypair
  ): Promise<{ signature: string; mint: string }> {
    const imageFile = options.imageFile || new Blob([''], { type: 'image/png' });

    const metadataResponse = await this.uploadMetadata({
      file: imageFile,
      name: options.tokenMetadata.name,
      symbol: options.tokenMetadata.symbol,
      description: options.tokenMetadata.description || '',
      website: options.tokenMetadata.website,
      twitter: options.tokenMetadata.twitter,
      telegram: options.tokenMetadata.telegram,
    });

    const requestBody = {
      publicKey: signerKeypair.publicKey.toBase58(),
      action: 'create',
      tokenMetadata: {
        name: metadataResponse.metadata.name,
        symbol: metadataResponse.metadata.symbol,
        uri: metadataResponse.metadataUri
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: 'true',
      amount: options.devBuyAmount || 1,
      slippage: options.slippage || 10,
      priorityFee: options.priorityFee || 0.0005,
      pool: 'pump'
    };

    const response = await fetch(this.config.api.tradeLocal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Failed to create token: ${response.statusText}`);
    }

    const data = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(data));
    tx.sign([mintKeypair, signerKeypair]);
    
    const signature = await this.connection.sendTransaction(tx);
    
    return {
      signature,
      mint: mintKeypair.publicKey.toBase58()
    };
  }

  async createTokenWithJitoBundle(
    options: PumpFunTokenCreationOptions,
    signerKeypairs: Keypair[],
    mintKeypair: Keypair
  ): Promise<{ signatures: string[]; mint: string }> {
    if (signerKeypairs.length === 0 || signerKeypairs.length > 5) {
      throw new Error('Must provide 1-5 signer keypairs for Jito bundling');
    }

    const imageFile = options.imageFile || new Blob([''], { type: 'image/png' });

    const metadataResponse = await this.uploadMetadata({
      file: imageFile,
      name: options.tokenMetadata.name,
      symbol: options.tokenMetadata.symbol,
      description: options.tokenMetadata.description || '',
      website: options.tokenMetadata.website,
      twitter: options.tokenMetadata.twitter,
      telegram: options.tokenMetadata.telegram,
    });

    const bundledTxArgs = [
      {
        publicKey: signerKeypairs[0].publicKey.toBase58(),
        action: 'create',
        tokenMetadata: {
          name: options.tokenMetadata.name,
          symbol: options.tokenMetadata.symbol,
          uri: metadataResponse.metadataUri
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'false',
        amount: 10000000,
        slippage: options.slippage || 10,
        priorityFee: options.priorityFee || 0.0001,
        pool: 'pump'
      }
    ];

    for (let i = 1; i < signerKeypairs.length; i++) {
      bundledTxArgs.push({
        publicKey: signerKeypairs[i].publicKey.toBase58(),
        action: 'buy',
        tokenMetadata: {
          name: options.tokenMetadata.name,
          symbol: options.tokenMetadata.symbol,
          uri: metadataResponse.metadataUri
        },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: 'false',
        amount: 10000000,
        slippage: options.slippage || 10,
        priorityFee: 0.00005,
        pool: 'pump'
      });
    }

    const response = await fetch(this.config.api.tradeLocal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bundledTxArgs)
    });

    if (!response.ok) {
      throw new Error(`Failed to create bundled transactions: ${response.statusText}`);
    }

    const transactions = await response.json();
    const encodedSignedTransactions: string[] = [];
    const signatures: string[] = [];

    for (let i = 0; i < bundledTxArgs.length; i++) {
      const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(transactions[i])));
      
      if (bundledTxArgs[i].action === 'create') {
        tx.sign([mintKeypair, signerKeypairs[i]]);
      } else {
        tx.sign([signerKeypairs[i]]);
      }
      
      encodedSignedTransactions.push(bs58.encode(tx.serialize()));
      signatures.push(bs58.encode(tx.signatures[0]));
    }

    const jitoResponse = await fetch(this.config.jito.bundleEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendBundle',
        params: [encodedSignedTransactions]
      })
    });

    if (!jitoResponse.ok) {
      throw new Error(`Failed to submit Jito bundle: ${jitoResponse.statusText}`);
    }

    return {
      signatures,
      mint: mintKeypair.publicKey.toBase58()
    };
  }

  getConfig() {
    return this.config;
  }

  switchNetwork(network: 'mainnet' | 'testnet') {
    this.network = network;
    this.config = PUMPFUN_CONFIG[network];
  }
}

export function createPumpFunService(
  connection: Connection,
  network: 'mainnet' | 'testnet' = 'mainnet'
): PumpFunService {
  return new PumpFunService(connection, network);
}