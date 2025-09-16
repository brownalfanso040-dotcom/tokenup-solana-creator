import { LucideProps } from 'lucide-react';
import { ForwardRefExoticComponent, RefAttributes } from 'react';

export type HelpType = {
  id: number;
  title: string;
  text: string;
  img: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>> | string;
};

export type FAQType = {
  id: number;
  question: string;
  answer: string;
};

export type TokenMetaDataType = {
  name: string;
  symbol: string;
  logo: File | undefined;
  decimals: number;
  supply: number;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  enableCreator: boolean;
  creatorName?: string;
  creatorWebsite?: string;
  freezeable: boolean;
  mintable: boolean;
  updateable: boolean;
  // PumpFun specific options
  usePumpFun?: boolean;
  devBuyAmount?: number;
  useJitoBundling?: boolean;
  slippage?: number;
  priorityFee?: number;
};

export type ProgressType = {
  id: string;
  title: string;
};

export type RevokeAuthorityType = {
  id: number;
  title: string;
  content: string;
  logo: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;
  type: keyof TokenMetaDataType;
};

export type PromoteItemType = {
  id: number;
  title: string;
  price?: number;
  benefits: string[];
  fromColor: string;
  viaColor: string;
  toColor: string;
  textColor: string;
};

export interface Configuration {
  pubKey: string | null;
}

// Enhanced types for Helius API integration
export interface LaunchedToken {
  id: string;
  name: string;
  symbol: string;
  mintAddress: string;
  network: 'mainnet' | 'devnet';
  timestamp: number;
  creator?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  supply?: number;
  decimals?: number;
  verified?: boolean;
  heliusData?: {
    asset?: any;
    metadata?: any;
    lastUpdated: string;
  };
  // PumpFun specific fields
  isPumpFun?: boolean;
  tokenType?: 'pumpfun' | 'spl' | 'spl-2022' | 'unknown';
  pumpFunData?: {
    createdOn?: string;
    marketCap?: number;
    bondingCurve?: string;
    associatedBondingCurve?: string;
    virtualTokenReserves?: number;
    virtualSolReserves?: number;
    complete?: boolean;
    lastUpdated: string;
  };
}

export interface TokenAnalytics {
  mintAddress: string;
  network: 'mainnet' | 'devnet';
  holders: number;
  transactions24h: number;
  volume24h: number;
  marketCap?: number;
  price?: number;
  priceChange24h?: number;
  lastUpdated: string;
}

export interface WalletTokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  tokenAccount: string;
  metadata?: {
    name?: string;
    symbol?: string;
    image?: string;
  };
}

export interface TransactionSummary {
  signature: string;
  type: string;
  description: string;
  timestamp: number;
  fee: number;
  status: 'success' | 'failed' | 'pending';
  tokenTransfers?: Array<{
    mint: string;
    amount: number;
    from: string;
    to: string;
  }>;
}