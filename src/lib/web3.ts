import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  getMintLen,
  createInitializeMetadataPointerInstruction,
  TYPE_SIZE,
  LENGTH_SIZE,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createSetAuthorityInstruction,
  createUpdateAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import {
  createInitializeInstruction,
  createUpdateFieldInstruction,
  pack,
  TokenMetadata,
} from '@solana/spl-token-metadata';
import { TokenMetaDataType } from './types';

export async function createTokenCreationTransaction(
  connection: Connection,
  tokenMetaData: TokenMetaDataType,
  publicKey: PublicKey,
  uri: string
) {
  try {
    // Generate new keypair for Mint Account
    const mintKeypair = Keypair.generate();
    const tokenMint = mintKeypair.publicKey;

    const transaction: Transaction = new Transaction();
    const metaData: TokenMetadata = {
      mint: tokenMint,
      name: tokenMetaData.name,
      symbol: tokenMetaData.symbol,
      uri: uri,
      additionalMetadata: [],
    };

    // Size of MetadataExtension 2 bytes for type, 2 bytes for length
    const metadataExtension = TYPE_SIZE + LENGTH_SIZE;
    const metadataLen = pack(metaData).length; // Size of metadata
    const mintLen = getMintLen([ExtensionType.MetadataPointer]); // Size of Mint Account with extension

    // Minimum lamports required for Mint Account
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataExtension + metadataLen);

    // Instruction to invoke System Program to create new account
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: publicKey, // Account that will transfer lamports to created account
      newAccountPubkey: tokenMint, // Address of the account to create
      space: mintLen, // Amount of bytes to allocate to the created account
      lamports, // Amount of lamports transferred to created account
      programId: TOKEN_2022_PROGRAM_ID, // Program assigned as owner of created account
    });

    // Instruction to initialize the MetadataPointer Extension
    const initializeMetadataPointerInstruction = createInitializeMetadataPointerInstruction(
      tokenMint, // Mint Account address
      !tokenMetaData.updateable ? publicKey : null, // Authority that can set the metadata address
      tokenMint, // Account address that holds the metadata
      TOKEN_2022_PROGRAM_ID
    );

    // Instruction to initialize Mint Account data
    const initializeMintInstruction = createInitializeMintInstruction(
      tokenMint, // Mint Account Address
      tokenMetaData.decimals, // Decimals of Mint
      publicKey, // Designated Mint Authority
      !tokenMetaData.freezeable ? publicKey : null, // Optional Freeze Authority
      TOKEN_2022_PROGRAM_ID // Token Extension Program ID
    );

    // Instruction to initialize Metadata Account data
    const initializeMetadataInstruction = createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, // Token Extension Program as Metadata Program
      mint: tokenMint, // Mint Account address
      metadata: tokenMint, // Account address that holds the metadata
      mintAuthority: publicKey, // Designated Mint Authority
      updateAuthority: publicKey, // Authority that can update the metadata
      name: metaData.name,
      symbol: metaData.symbol,
      uri: metaData.uri,
    });

    // Get the latest blockhash for the transaction
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    // Add core instructions first (create account, initialize metadata pointer, initialize mint, initialize metadata)
    transaction.add(
      createAccountInstruction,
      initializeMetadataPointerInstruction,
      initializeMintInstruction,
      initializeMetadataInstruction
    );

    // Check if we can fit more instructions without exceeding transaction size limit
    const currentSize = transaction.serialize({ requireAllSignatures: false }).length;
    const maxTransactionSize = 1232; // Solana transaction size limit
    
    console.log('Current transaction size:', currentSize, 'bytes');

    // Only add ATA and mint instructions if we have space
    if (currentSize < maxTransactionSize - 300) { // Leave buffer for additional instructions
      const newATA = await getAssociatedTokenAddress(tokenMint, publicKey, undefined, TOKEN_2022_PROGRAM_ID);
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        publicKey,
        newATA,
        publicKey,
        tokenMint,
        TOKEN_2022_PROGRAM_ID
      );
      
      console.log(
        'ATA',
        newATA.toString(),
        'total supply',
        BigInt(tokenMetaData.supply) * BigInt(10 ** tokenMetaData.decimals)
      );

      // Create the mint to instruction
      const mintToInstruction = createMintToInstruction(
        tokenMint,
        newATA,
        publicKey,
        BigInt(tokenMetaData.supply) * BigInt(10 ** tokenMetaData.decimals),
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      transaction.add(createATAInstruction, mintToInstruction);
    }

    // Authority revocation instructions will be handled in a separate transaction if needed
    // This helps keep the main transaction under size limits

    return { transaction, signers: [mintKeypair], mint: tokenMint };
  } catch (error) {
    console.error('Error creating token transaction:', error);
    return { transaction: null, signers: [], mint: null };
  }
}

export async function createAuthorityRevocationTransaction(
  connection: Connection,
  tokenMetaData: TokenMetaDataType,
  publicKey: PublicKey,
  tokenMint: PublicKey
) {
  try {
    const transaction = new Transaction();
    
    // Get the latest blockhash for the transaction
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    // Set update authority as null if the token is NOT updateable
    if (!tokenMetaData.updateable) {
      transaction.add(
        createUpdateAuthorityInstruction({
          metadata: tokenMint,
          newAuthority: null,
          oldAuthority: publicKey,
          programId: TOKEN_2022_PROGRAM_ID,
        })
      );
    }

    // Set mint authority as null if the token is NOT mintable
    if (!tokenMetaData.mintable) {
      transaction.add(
        createSetAuthorityInstruction(
          tokenMint,
          publicKey,
          AuthorityType.MintTokens,
          null,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    return { transaction, signers: [] };
  } catch (error) {
    console.error('Error creating authority revocation transaction:', error);
    return { transaction: null, signers: [] };
  }
}