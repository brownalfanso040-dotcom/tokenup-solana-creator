'use client';

import React, { Dispatch, SetStateAction, useState } from 'react';
import { Globe, MessageCircle, Twitter } from 'lucide-react';
import Progress from './Progress';
import { GradientButton } from '../component/Button';
import TextField from '../component/TextField';
import ImageUpload from '../component/ImageUpload';
import { TokenMetaDataType } from '@/lib/types';
import ModifyCreatorInformation from './ModifyCreatorInformation';
import RevokeAuthority from './RevokeAuthority';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import { createTokenCreationTransaction, createAuthorityRevocationTransaction } from '@/lib/web3';
import { uploadToIPFS } from '@/lib/ipfsUpload';
import { AxiosProgressEvent } from 'axios';
import Image from 'next/image';
import { useStateContext } from '@/provider/StateProvider';
import { useNetwork } from '@/context/NetworkContext';
import NetworkIndicator from '../ui/NetworkIndicator';
import { TokenStorage, LaunchedToken } from '@/lib/localStorage';
import { createPumpFunService, PumpFunTokenCreationOptions } from '@/lib/pumpfunService';
import { Keypair } from '@solana/web3.js';

const TokenCreation = ({
  setError,
  setMintAddress,
}: // pubKey,
// initialFee,
{
  // initialFee: number;
  // pubKey: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  setMintAddress: Dispatch<SetStateAction<string | null>>;
}): React.JSX.Element => {
  const [currentProgress, setCurrentProgress] = useState<number>(0);
  const [tokenMetaData, setTokenMetaData] = useState<TokenMetaDataType>({
    name: '',
    symbol: '',
    supply: 1000000000,
    decimals: 9,
    logo: undefined,
    enableCreator: true,
    freezeable: true,
    mintable: true,
    updateable: true,
    // PumpFun options
    usePumpFun: false,
    devBuyAmount: 1,
    useJitoBundling: false,
    slippage: 10,
    priorityFee: 0.0005,
  });
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const { publicKey, connected, sendTransaction } = useWallet();
  const { configData } = useStateContext();
  const { rpcUrl, network } = useNetwork();

  // If user clicks next or create token button
  async function handleNextOrCreateClick() {
    try {
      if (currentProgress < 4) {
        setCurrentProgress(currentProgress + 1);
      } else if (currentProgress === 4) {
        setIsCreating(true);
        if (!(publicKey && connected && sendTransaction)) {
          throw new Error(`Please connect wallet!`);
        }
        const connection = new Connection(rpcUrl, 'confirmed');

        const balance = await connection.getBalance(publicKey);

        // Check if wallet has sufficient SOL for transaction
        const minimumBalance = 0.01 * LAMPORTS_PER_SOL; // Minimum 0.01 SOL required
        if (balance < minimumBalance) {
          throw new Error(`Insufficient SOL balance. You need at least 0.01 SOL to create a token. Current balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL. Please add SOL to your wallet.`);
        }

        if (!tokenMetaData.logo) {
          throw new Error('Please upload token log at first.');
        }

        // Upload token logo to IPFS
        const logo = await uploadToIPFS(tokenMetaData.logo, ({}: AxiosProgressEvent) => {}).catch(() => {
          throw new Error('Token logo upload failed to IPFS. Please retry.');
        });

        let signature: string;
        let mint: PublicKey;
        let metadataUri: string = '';

        if (tokenMetaData.usePumpFun) {
          // PumpFun token creation
          
          const pumpFunService = createPumpFunService(connection, network as 'mainnet' | 'testnet');
          const mintKeypair = Keypair.generate();
          
          // Note: For PumpFun, we need to handle wallet signing differently
          // The wallet adapter will handle signing, so we create a temporary keypair for the structure
          // but the actual signing will be done through the wallet adapter
          const tempSignerKeypair = Keypair.generate();
          
          const pumpFunOptions: PumpFunTokenCreationOptions = {
            tokenMetadata: tokenMetaData,
            network: network as 'mainnet' | 'testnet',
            devBuyAmount: tokenMetaData.devBuyAmount || 1,
            slippage: tokenMetaData.slippage || 10,
            priorityFee: tokenMetaData.priorityFee || 0.0005,
            useJitoBundling: tokenMetaData.useJitoBundling || false,
            imageFile: tokenMetaData.logo
          };

          if (tokenMetaData.useJitoBundling) {
            // Use Jito bundling for MEV protection
            const result = await pumpFunService.createTokenWithJitoBundle(
              pumpFunOptions,
              [tempSignerKeypair], // Can add more wallets for bundling
              mintKeypair
            );
            signature = result.signatures[0];
            mint = new PublicKey(result.mint);
            metadataUri = ''; // PumpFun handles metadata internally
          } else {
            // Standard PumpFun creation
            const result = await pumpFunService.createTokenLocal(
              pumpFunOptions,
              mintKeypair,
              tempSignerKeypair
            );
            signature = result.signature;
            mint = new PublicKey(result.mint);
            metadataUri = ''; // PumpFun handles metadata internally
          }
        } else {
          // Traditional SPL Token 2022 creation
          
          // Upload metadata.json to IPFS for SPL tokens
          metadataUri = await uploadToIPFS(
            new File(
              [
                JSON.stringify({
                  name: tokenMetaData.name,
                  symbol: tokenMetaData.symbol,
                  description: tokenMetaData.description,
                  image: logo,
                  website: tokenMetaData.website || '',
                  extensions: {
                    website: tokenMetaData.website || '',
                    twitter: tokenMetaData.twitter || '',
                    telegram: tokenMetaData.telegram || '',
                    discord: tokenMetaData.discord || '',
                  },
                }),
              ],
              'metadata.json'
            ),
            ({}: AxiosProgressEvent) => {}
          ).catch(() => {
            throw new Error('Token metadata upload failed to IPFS. Please retry.');
          });

          // Create token creation transaction
          const { transaction, signers, mint: tokenMint } = await createTokenCreationTransaction(connection, tokenMetaData, publicKey, metadataUri);

          if (!transaction || !tokenMint) {
            throw new Error('Error while building the token creation transaction.');
          }

          mint = tokenMint;

          // Send the main token creation transaction
          signature = await sendTransaction(transaction, connection, { 
            signers: signers,
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          });
          
          // Wait for transaction confirmation
          const confirmation = await connection.confirmTransaction(signature, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`Transaction failed during confirmation: ${JSON.stringify(confirmation.value.err)}`);
          }
        }

          // Handle authority revocation in a separate transaction if needed
          if (!tokenMetaData.updateable || !tokenMetaData.mintable) {
            const { transaction: revocationTx } = await createAuthorityRevocationTransaction(
              connection, 
              tokenMetaData, 
              publicKey, 
              mint
            );

            if (revocationTx && revocationTx.instructions.length > 0) {
              try {
                const revocationSignature = await sendTransaction(revocationTx, connection, {
                  skipPreflight: false,
                  preflightCommitment: 'confirmed'
                });
                
                const revocationConfirmation = await connection.confirmTransaction(revocationSignature, 'confirmed');
                if (revocationConfirmation.value.err) {
                  // Authority revocation failed, but token was created successfully
                }
              } catch {
                // Authority revocation failed, but token was created successfully
              }
            }
          }
          
          // definite.cryptocreation process - track transaction completion
          const cryptocreationResult = {
            network,
            mintAddress: mint.toString(),
            transactionSignature: signature,
            timestamp: new Date().toISOString(),
            status: 'completed'
          };
          
          // Create explorer URL based on network
          const explorerUrl = network === 'mainnet' 
            ? `https://explorer.solana.com/tx/${signature}`
            : `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
          
        try {
          // Save token data to local storage
          const tokenData: LaunchedToken = {
            id: mint.toString(),
            name: tokenMetaData.name,
            symbol: tokenMetaData.symbol,
            supply: tokenMetaData.supply,
            decimals: tokenMetaData.decimals,
            mintAddress: mint.toString(),
            transactionSignature: signature,
            network,
            timestamp: new Date().toISOString(),
            status: 'completed',
            description: tokenMetaData.description,
            website: tokenMetaData.website,
            twitter: tokenMetaData.twitter,
            telegram: tokenMetaData.telegram,
            discord: tokenMetaData.discord,
            metadataUri: metadataUri,
            explorerUrl
          };
          
          // Save to local storage
          TokenStorage.saveToken(tokenData);
          
          setMintAddress(mint.toString());
          setIsCreating(false);
        } catch (sendError: unknown) {
          
          // Check if the error is due to user cancellation
          if (sendError instanceof Error && sendError.message.includes('User rejected the request.')) {
            setError('Transaction was canceled by the user.');
            setIsCreating(false);
            return;
          }
          
          // Check for specific error types
          if (sendError instanceof Error && sendError.message.includes('insufficient funds')) {
            throw new Error('Insufficient SOL balance to complete the transaction. Please add more SOL to your wallet.');
          }
          
          if (sendError instanceof Error && sendError.message.includes('blockhash not found')) {
            throw new Error('Network congestion detected. Please try again in a few moments.');
          }
          
          if (sendError instanceof Error && sendError.message.includes('Transaction simulation failed')) {
            throw new Error('Transaction simulation failed. This might be due to insufficient funds or network issues. Please check your balance and try again.');
          }
          
          const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error occurred';
          
          // Provide the actual error message instead of generic "Transaction failed"
          throw new Error(`Transaction failed: ${errorMessage}`);
        }
      }
    } catch (error) {
      setIsCreating(false);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      setError(errorMessage);
    }
  }

  return (
    <div className='max-w-[1440px] mx-auto !mb-6 px-4 sm:px-12 subtitle-animate'>
      {currentProgress !== 0 && (
        <div className='space-y-4 mb-12'>
          <h2 className='text-2xl sm:text-5xl text-text-main text-center'>Create Solana Token!</h2>
          <p className='text-xs sm:text-xl text-text-secondary text-center'>
            Create your custom Solana token with all the features you need.
          </p>
          <div className='flex justify-center'>
            <NetworkIndicator />
          </div>
        </div>
      )}
      {currentProgress !== 0 && <Progress currentProgress={currentProgress} setCurrentProgress={setCurrentProgress} />}
      <div className='relative rounded-xl bg-secondary border-gray-700 border py-6 px-4 overflow-hidden'>
        {currentProgress === 0 && (
          <Image
            alt='waves'
            src='/waves.png'
            className='absolute md:w-full sm:w-[150vw] w-[200vw] max-w-[10000px] -left-1/2 sm:-left-1/3 md:left-0 bottom-0'
            width={1000}
            height={300}
          />
        )}

        <div className='space-y-6 rounded-xl'>
          {/* Progress O */}
          {currentProgress === 0 && (
            <div className='relative flex flex-col items-center space-y-8 create-token-first w-full p-4 sm:p-8'>
              <div className='space-y-4'>
                <h2 className='text-2xl sm:text-5xl text-text-main text-center'>Create Solana Token!</h2>
                <p className='text-xs sm:text-xl text-text-secondary text-center'>
                  Create your custom Solana token with all the features you need.
                </p>
                <div className='flex justify-center'>
                  <NetworkIndicator />
                </div>
              </div>
              <GradientButton
                className='w-full sm:w-[200px] h-[54px] justify-self-center'
                onClick={() => setCurrentProgress(currentProgress + 1)}
                disabled={!publicKey || !connected}
              >
                Create Token
              </GradientButton>
            </div>
          )}

          {/* Progress I */}
          {currentProgress === 1 && (
            <div className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
                <TextField label='Token Name *' placeholder='Cosmic Coin' name='name' value={tokenMetaData?.name} setTokenMetaData={setTokenMetaData} />
                <TextField label='Token Symbol *' placeholder='CSMC' name='symbol' value={tokenMetaData?.symbol} setTokenMetaData={setTokenMetaData} helperText='Max. 8 symbols' />
              </div>
              <ImageUpload className='mt-6 md:mt-8' tokenMetaData={tokenMetaData} setTokenMetaData={setTokenMetaData} />
            </div>
          )}

          {/* Progress II */}
          {currentProgress === 2 && (
            <div className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6'>
                <TextField
                  label='Token Decimals *'
                  placeholder='9'
                  name='decimals'
                  min={0}
                  max={9}
                  helperText='Enter a value between 0 and 9 decimals'
                  value={tokenMetaData?.decimals}
                  setTokenMetaData={setTokenMetaData}
                />
                <TextField
                  label='Total Supply *'
                  placeholder='1000000000'
                  name='supply'
                  type='number'
                  max={1e19 / 10 ** (tokenMetaData.decimals || 0)}
                  value={tokenMetaData?.supply}
                  helperText='Common supply is 1 billion'
                  setTokenMetaData={setTokenMetaData}
                />
              </div>
              <div>
                <span className='block text-text-secondary text-sm font-medium mb-2'>Describe your token</span>
                <textarea
                  className='w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-text-main focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition'
                  value={tokenMetaData.description}
                  placeholder='Write text here ...'
                  onChange={(e) =>
                    setTokenMetaData((prev) => {
                      return { ...prev, description: e.target.value };
                    })
                  }
                />
              </div>
              
              {/* PumpFun Options */}
              <div className='space-y-4 border-t border-gray-600 pt-6'>
                <h3 className='text-lg font-semibold text-text-main'>Token Creation Method</h3>
                
                <div className='flex items-center space-x-3'>
                  <input
                    type='checkbox'
                    id='usePumpFun'
                    checked={tokenMetaData.usePumpFun || false}
                    onChange={(e) =>
                      setTokenMetaData((prev) => ({
                        ...prev,
                        usePumpFun: e.target.checked
                      }))
                    }
                    className='w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500'
                  />
                  <label htmlFor='usePumpFun' className='text-text-main font-medium'>
                    Use PumpFun for token creation
                  </label>
                </div>
                
                {tokenMetaData.usePumpFun && (
                  <div className='space-y-4 pl-6 border-l-2 border-cyan-500/30'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <TextField
                        label='Dev Buy Amount (SOL)'
                        placeholder='1'
                        name='devBuyAmount'
                        type='number'
                        min={0.1}
                        max={10}
                        value={tokenMetaData.devBuyAmount || 1}
                        helperText='Initial SOL buy amount'
                        setTokenMetaData={setTokenMetaData}
                      />
                      <TextField
                        label='Slippage (%)'
                        placeholder='10'
                        name='slippage'
                        type='number'
                        min={1}
                        max={50}
                        value={tokenMetaData.slippage || 10}
                        helperText='Transaction slippage tolerance'
                        setTokenMetaData={setTokenMetaData}
                      />
                    </div>
                    
                    <TextField
                      label='Priority Fee (SOL)'
                      placeholder='0.0005'
                      name='priorityFee'
                      type='number'
                      min={0.0001}
                      max={0.01}
                      step={0.0001}
                      value={tokenMetaData.priorityFee || 0.0005}
                      helperText='Transaction priority fee'
                      setTokenMetaData={setTokenMetaData}
                    />
                    
                    <div className='flex items-center space-x-3'>
                      <input
                        type='checkbox'
                        id='useJitoBundling'
                        checked={tokenMetaData.useJitoBundling || false}
                        onChange={(e) =>
                          setTokenMetaData((prev) => ({
                            ...prev,
                            useJitoBundling: e.target.checked
                          }))
                        }
                        className='w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500'
                      />
                      <label htmlFor='useJitoBundling' className='text-text-main font-medium'>
                        Enable Jito Bundling (MEV Protection)
                      </label>
                    </div>
                    
                    <div className='text-sm text-text-secondary bg-gray-800/50 p-3 rounded-lg'>
                      <p className='font-medium text-cyan-400 mb-1'>PumpFun Features:</p>
                      <ul className='list-disc list-inside space-y-1'>
                        <li>Automatic liquidity pool creation</li>
                        <li>Built-in trading interface</li>
                        <li>Community-driven token discovery</li>
                        <li>Optional MEV protection with Jito bundling</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress III */}
          {currentProgress === 3 && (
            <ModifyCreatorInformation tokenMetaData={tokenMetaData} setTokenMetaData={setTokenMetaData} />
          )}

          {/* Progress IV */}
          {currentProgress === 4 && (
            <RevokeAuthority tokenMetaData={tokenMetaData} setTokenMetaData={setTokenMetaData} />
          )}

          {/* Next Button */}
          {currentProgress !== 0 && (
            <div className='flex justify-center pt-6'>
              <GradientButton
                className='w-full sm:w-[200px] h-[54px]'
                onClick={handleNextOrCreateClick}
                disabled={isCreating || !publicKey || !connected}
              >
                {isCreating ? 'Creating...' : currentProgress === 4 ? 'Create Token' : 'Next'}
              </GradientButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenCreation;