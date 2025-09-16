'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Wallet, 
  Search, 
  Copy, 
  ExternalLink, 
  AlertCircle, 
  Coins,
  RefreshCw
} from 'lucide-react';
import { WalletTokenBalance } from '@/lib/types';
import { getWeb3Service } from '@/lib/web3Service';
import { useNetwork } from '@/context/NetworkContext';
import { toast } from '@/lib/toast';

interface WalletTokensProps {
  walletAddress?: string;
  className?: string;
}

export function WalletTokens({ walletAddress: initialAddress, className = '' }: WalletTokensProps) {
  const [walletAddress, setWalletAddress] = useState(initialAddress || '');
  const [tokens, setTokens] = useState<WalletTokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { network } = useNetwork();

  useEffect(() => {
    if (initialAddress) {
      fetchWalletTokens(initialAddress);
    }
  }, [initialAddress, network]);

  const fetchWalletTokens = async (address: string) => {
    if (!address.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const web3Service = getWeb3Service(network);
      const tokenBalances = await web3Service.getWalletTokens(address);
      
      // Filter out tokens with zero balance and sort by amount
      const filteredTokens = tokenBalances
        .filter(token => token.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      setTokens(filteredTokens);

      if (filteredTokens.length === 0) {
        setError('No tokens found in this wallet');
      }

    } catch (err) {
      console.error('Error fetching wallet tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch wallet tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchWalletTokens(walletAddress);
  };

  const handleRefresh = () => {
    if (walletAddress) {
      fetchWalletTokens(walletAddress);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatAmount = (amount: number, decimals: number): string => {
    const adjustedAmount = amount / Math.pow(10, decimals);
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: decimals > 6 ? 6 : decimals,
      minimumFractionDigits: 0
    }).format(adjustedAmount);
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const openInExplorer = (address: string) => {
    const baseUrl = network === 'mainnet' 
      ? 'https://explorer.solana.com' 
      : 'https://explorer.solana.com?cluster=devnet';
    window.open(`${baseUrl}/address/${address}`, '_blank');
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Wallet Tokens
          <Badge variant="outline">{network}</Badge>
        </CardTitle>
        
        {/* Search Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter wallet address..."
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
          {tokens.length > 0 && (
            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="text-right space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && tokens.length === 0 && walletAddress && (
          <div className="text-center py-8 text-muted-foreground">
            <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No tokens found in this wallet</p>
          </div>
        )}

        {!loading && !error && tokens.length === 0 && !walletAddress && (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Enter a wallet address to view token balances</p>
          </div>
        )}

        {!loading && !error && tokens.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
              <span>Found {tokens.length} tokens</span>
              <span>Total value calculation coming soon</span>
            </div>

            {tokens.map((token, index) => (
              <div 
                key={`${token.mint}-${index}`}
                className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Token Image */}
                <div className="flex-shrink-0">
                  {token.metadata?.image ? (
                    <img 
                      src={token.metadata.image} 
                      alt={token.metadata.name || 'Token'}
                      className="h-12 w-12 rounded-lg object-cover border"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className={`h-12 w-12 rounded-lg bg-muted flex items-center justify-center ${
                      token.metadata?.image ? 'hidden' : 'flex'
                    }`}
                  >
                    <Coins className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>

                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">
                      {token.metadata?.name || 'Unknown Token'}
                    </h3>
                    {token.metadata?.symbol && (
                      <Badge variant="secondary" className="text-xs">
                        {token.metadata.symbol}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {formatAddress(token.mint)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(token.mint, 'Token address')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openInExplorer(token.mint)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Balance */}
                <div className="text-right">
                  <p className="font-medium">
                    {formatAmount(token.amount, token.decimals)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {token.metadata?.symbol || 'tokens'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WalletTokens;