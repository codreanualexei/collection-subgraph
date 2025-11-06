import {
  BigInt,
  Address,
  Bytes,
  ethereum,
} from '@graphprotocol/graph-ts'

// StrDomainsNFT events
import {
  Minted as MintedEvent,
  SaleRecorded as SaleRecordedEvent,
  TokenSplitterSet as TokenSplitterSetEvent,
  Transfer as TransferEvent,
  TreasuryUpdated as TreasuryUpdatedEvent,
  DefaultRoyaltyUpdated as DefaultRoyaltyUpdatedEvent,
  SplitterFactoryUpdated as SplitterFactoryUpdatedEvent,
  StrDomainsNFT as StrDomainsNFTContract,
} from '../generated/StrDomainsNFT/StrDomainsNFT'

// RoyaltySplitterFactory events
import {
  SplitterCreated as SplitterCreatedEvent,
} from '../generated/RoyaltySplitterFactory/RoyaltySplitterFactory'

// RoyaltySplitter events (from template)
import {
  Initialized as RoyaltySplitterInitializedEvent,
  SplitsUpdated as SplitsUpdatedEvent,
  Received as RoyaltyReceivedEvent,
  TokenReceived as RoyaltyTokenReceivedEvent,
  Withdraw as RoyaltyWithdrawEvent,
  WithdrawToken as RoyaltyTokenWithdrawEvent,
  RoyaltySplitter as RoyaltySplitterContract,
} from '../generated/templates/RoyaltySplitter/RoyaltySplitter'

// Marketplace events
import {
  Listed as ListedEvent,
  ListingUpdated as ListingUpdatedEvent,
  ListingCanceled as ListingCanceledEvent,
  Purchased as PurchasedEvent,
  FeeWithdrawn as FeeWithdrawnEvent,
  Marketplace as MarketplaceContract,
} from '../generated/Marketplace/Marketplace'

// Schema entities
import {
  Account,
  Token,
  RoyaltySplitter,
  Sale,
  Transfer,
  RoyaltyReceived,
  RoyaltyTokenReceived,
  RoyaltyWithdraw,
  RoyaltyTokenWithdraw,
  RoyaltyBalance,
  Contract,
  Marketplace,
  Listing,
  Purchase,
  FeeWithdrawal,
} from '../generated/schema'

import { RoyaltySplitter as RoyaltySplitterTemplate } from '../generated/templates'

// Helper function to ensure Account exists
function ensureAccount(address: Address): Account {
  let accountId = address.toHexString()
  let account = Account.load(accountId)
  if (account == null) {
    account = new Account(accountId)
    account.save()
  }
  return account as Account
}

// Helper function to ensure Contract state exists
function ensureContract(contractAddress: Address): Contract {
  let contractId = contractAddress.toHexString()
  let contract = Contract.load(contractId)
  if (contract == null) {
    contract = new Contract(contractId)
    contract.treasury = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    contract.splitterFactory = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    contract.defaultRoyaltyBps = BigInt.fromI32(0)
    contract.lastId = BigInt.fromI32(0)
    contract.save()
  }
  return contract as Contract
}

// ============ StrDomainsNFT Event Handlers ============

export function handleMinted(event: MintedEvent): void {
  let contract = ensureContract(event.address)
  
  let tokenId = event.params.tokenId
  let tokenEntityId = tokenId.toString()
  let to = event.params.to
  let creator = event.params.creator
  
  // Create accounts
  let toAccount = ensureAccount(to)
  let creatorAccount = ensureAccount(creator)
  
  // Create token entity
  let token = new Token(tokenEntityId)
  token.tokenId = tokenId
  token.owner = toAccount.id
  token.creator = creatorAccount.id
  token.tokenURI = event.params.tokenURI
  token.domainName = event.params.domain
  token.mintedAt = event.block.timestamp
  token.lastSalePrice = null
  token.lastSaleAt = null
  token.blockNumber = event.block.number
  token.transactionHash = event.transaction.hash
  
  // Update contract lastId
  let contractInstance = StrDomainsNFTContract.bind(event.address)
  let lastIdResult = contractInstance.try_getLastId()
  if (!lastIdResult.reverted) {
    contract.lastId = lastIdResult.value
  }
  
  contract.save()
  token.save()
}

export function handleTokenSplitterSet(event: TokenSplitterSetEvent): void {
  let tokenId = event.params.tokenId
  let tokenEntityId = tokenId.toString()
  let splitterAddress = event.params.splitter
  
  let token = Token.load(tokenEntityId)
  if (token == null) {
    return
  }
  
  // Create or load splitter
  let splitterId = splitterAddress.toHexString()
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    splitter = new RoyaltySplitter(splitterId)
    splitter.address = splitterAddress
    splitter.ethBalance = BigInt.fromI32(0)
    splitter.creatorEthBalance = BigInt.fromI32(0)
    splitter.treasuryEthBalance = BigInt.fromI32(0)
    splitter.createdAt = event.block.timestamp
  }
  
  token.royaltySplitter = splitter.id
  token.royaltyBps = event.params.royaltyBps
  splitter.token = token.id
  
  splitter.blockNumber = event.block.number
  splitter.transactionHash = event.transaction.hash
  
  splitter.save()
  token.save()
}

export function handleSaleRecorded(event: SaleRecordedEvent): void {
  let tokenId = event.params.tokenId
  let tokenEntityId = tokenId.toString()
  
  let token = Token.load(tokenEntityId)
  if (token == null) {
    return
  }
  
  // Update token sale info
  token.lastSalePrice = event.params.price
  token.lastSaleAt = event.params.at
  
  // Create sale entity
  let saleId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let sale = new Sale(saleId)
  sale.token = token.id
  sale.buyer = ensureAccount(event.params.buyer).id
  sale.price = event.params.price
  sale.timestamp = event.params.at
  sale.blockNumber = event.block.number
  sale.transactionHash = event.transaction.hash
  
  sale.save()
  token.save()
}

export function handleTransfer(event: TransferEvent): void {
  // Only track transfers, not mints (from address 0)
  if (event.params.from.toHexString() == '0x0000000000000000000000000000000000000000') {
    return
  }
  
  let tokenId = event.params.tokenId
  let tokenEntityId = tokenId.toString()
  
  let token = Token.load(tokenEntityId)
  if (token == null) {
    return
  }
  
  // Update token owner
  token.owner = ensureAccount(event.params.to).id
  
  // Create transfer entity
  let transferId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let transfer = new Transfer(transferId)
  transfer.token = token.id
  transfer.from = ensureAccount(event.params.from).id
  transfer.to = ensureAccount(event.params.to).id
  transfer.timestamp = event.block.timestamp
  transfer.blockNumber = event.block.number
  transfer.transactionHash = event.transaction.hash
  
  transfer.save()
  token.save()
}

export function handleTreasuryUpdated(event: TreasuryUpdatedEvent): void {
  let contract = ensureContract(event.address)
  contract.treasury = event.params.newTreasury
  contract.save()
}

export function handleDefaultRoyaltyUpdated(event: DefaultRoyaltyUpdatedEvent): void {
  let contract = ensureContract(event.address)
  contract.defaultRoyaltyBps = event.params.bps
  contract.save()
}

export function handleSplitterFactoryUpdated(event: SplitterFactoryUpdatedEvent): void {
  let contract = ensureContract(event.address)
  contract.splitterFactory = event.params.newFactory
  contract.save()
}

// ============ RoyaltySplitterFactory Event Handlers ============

export function handleSplitterCreated(event: SplitterCreatedEvent): void {
  let splitterAddress = event.params.splitter
  let splitterId = splitterAddress.toHexString()
  
  // Create splitter entity
  let splitter = new RoyaltySplitter(splitterId)
  splitter.address = splitterAddress
  splitter.creator = ensureAccount(event.params.creator).id
  splitter.treasury = ensureAccount(event.params.treasury).id
  splitter.creatorBps = BigInt.fromI32(event.params.creatorBps)
  splitter.treasuryBps = BigInt.fromI32(event.params.treasuryBps)
  splitter.ethBalance = BigInt.fromI32(0)
  splitter.creatorEthBalance = BigInt.fromI32(0)
  splitter.treasuryEthBalance = BigInt.fromI32(0)
  splitter.createdAt = event.block.timestamp
  splitter.blockNumber = event.block.number
  splitter.transactionHash = event.transaction.hash
  
  // Create RoyaltySplitter template instance to track its events
  RoyaltySplitterTemplate.create(splitterAddress)
  
  splitter.save()
}

// ============ RoyaltySplitter Event Handlers ============

export function handleRoyaltySplitterInitialized(event: RoyaltySplitterInitializedEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    splitter = new RoyaltySplitter(splitterId)
    splitter.address = splitterAddress
    splitter.ethBalance = BigInt.fromI32(0)
    splitter.creatorEthBalance = BigInt.fromI32(0)
    splitter.treasuryEthBalance = BigInt.fromI32(0)
  }
  
  splitter.creator = ensureAccount(event.params.creator).id
  splitter.treasury = ensureAccount(event.params.treasury).id
  splitter.creatorBps = BigInt.fromI32(event.params.creatorBps)
  splitter.treasuryBps = BigInt.fromI32(event.params.treasuryBps)
  splitter.createdAt = event.block.timestamp
  splitter.blockNumber = event.block.number
  splitter.transactionHash = event.transaction.hash
  
  splitter.save()
}

export function handleSplitsUpdated(event: SplitsUpdatedEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    return
  }
  
  splitter.creatorBps = BigInt.fromI32(event.params.creatorBps)
  splitter.treasuryBps = BigInt.fromI32(event.params.treasuryBps)
  splitter.save()
}

export function handleRoyaltyReceived(event: RoyaltyReceivedEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    return
  }
  
  // Update splitter ETH balance
  let contractInstance = RoyaltySplitterContract.bind(splitterAddress)
  let creatorAddress = Address.fromString(splitter.creator)
  let treasuryAddress = Address.fromString(splitter.treasury)
  let creatorBalanceResult = contractInstance.try_ethBalance(creatorAddress)
  let treasuryBalanceResult = contractInstance.try_ethBalance(treasuryAddress)
  
  if (!creatorBalanceResult.reverted && !treasuryBalanceResult.reverted) {
    splitter.creatorEthBalance = creatorBalanceResult.value
    splitter.treasuryEthBalance = treasuryBalanceResult.value
    splitter.ethBalance = creatorBalanceResult.value.plus(treasuryBalanceResult.value)
  }
  
  // Create royalty received entity
  let receivedId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let received = new RoyaltyReceived(receivedId)
  received.splitter = splitter.id
  received.from = event.params.from
  received.amount = event.params.amount
  received.timestamp = event.block.timestamp
  received.blockNumber = event.block.number
  received.transactionHash = event.transaction.hash
  
  received.save()
  splitter.save()
}

export function handleRoyaltyTokenReceived(event: RoyaltyTokenReceivedEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    return
  }
  
  // Update or create royalty balance
  let balanceId = splitterId + '-' + event.params.token.toHexString()
  let balance = RoyaltyBalance.load(balanceId)
  if (balance == null) {
    balance = new RoyaltyBalance(balanceId)
    balance.splitter = splitter.id
    balance.token = event.params.token
    balance.creatorBalance = BigInt.fromI32(0)
    balance.treasuryBalance = BigInt.fromI32(0)
  }
  
  // Update balances from contract
  let contractInstance = RoyaltySplitterContract.bind(splitterAddress)
  let creatorAddress = Address.fromString(splitter.creator)
  let treasuryAddress = Address.fromString(splitter.treasury)
  let creatorBalanceResult = contractInstance.try_erc20Balance(event.params.token, creatorAddress)
  let treasuryBalanceResult = contractInstance.try_erc20Balance(event.params.token, treasuryAddress)
  
  if (!creatorBalanceResult.reverted) {
    balance.creatorBalance = creatorBalanceResult.value
  }
  if (!treasuryBalanceResult.reverted) {
    balance.treasuryBalance = treasuryBalanceResult.value
  }
  
  // Create token received entity
  let receivedId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let received = new RoyaltyTokenReceived(receivedId)
  received.splitter = splitter.id
  received.token = event.params.token
  received.from = event.params.from
  received.amount = event.params.amount
  received.timestamp = event.block.timestamp
  received.blockNumber = event.block.number
  received.transactionHash = event.transaction.hash
  
  received.save()
  balance.save()
  splitter.save()
}

export function handleRoyaltyWithdraw(event: RoyaltyWithdrawEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    return
  }
  
  // Update splitter ETH balance
  let contractInstance = RoyaltySplitterContract.bind(splitterAddress)
  let creatorAddress = Address.fromString(splitter.creator)
  let treasuryAddress = Address.fromString(splitter.treasury)
  let creatorBalanceResult = contractInstance.try_ethBalance(creatorAddress)
  let treasuryBalanceResult = contractInstance.try_ethBalance(treasuryAddress)
  
  if (!creatorBalanceResult.reverted && !treasuryBalanceResult.reverted) {
    splitter.creatorEthBalance = creatorBalanceResult.value
    splitter.treasuryEthBalance = treasuryBalanceResult.value
    splitter.ethBalance = creatorBalanceResult.value.plus(treasuryBalanceResult.value)
  }
  
  // Create withdraw entity
  let withdrawId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let withdraw = new RoyaltyWithdraw(withdrawId)
  withdraw.splitter = splitter.id
  withdraw.to = event.params.to
  withdraw.amount = event.params.amount
  withdraw.timestamp = event.block.timestamp
  withdraw.blockNumber = event.block.number
  withdraw.transactionHash = event.transaction.hash
  
  withdraw.save()
  splitter.save()
}

export function handleRoyaltyTokenWithdraw(event: RoyaltyTokenWithdrawEvent): void {
  let splitterAddress = event.address
  let splitterId = splitterAddress.toHexString()
  
  let splitter = RoyaltySplitter.load(splitterId)
  if (splitter == null) {
    return
  }
  
  // Update royalty balance
  let balanceId = splitterId + '-' + event.params.token.toHexString()
  let balance = RoyaltyBalance.load(balanceId)
  if (balance == null) {
    balance = new RoyaltyBalance(balanceId)
    balance.splitter = splitter.id
    balance.token = event.params.token
    balance.creatorBalance = BigInt.fromI32(0)
    balance.treasuryBalance = BigInt.fromI32(0)
  }
  
  // Update balances from contract
  let contractInstance = RoyaltySplitterContract.bind(splitterAddress)
  let creatorAddress = Address.fromString(splitter.creator)
  let treasuryAddress = Address.fromString(splitter.treasury)
  let creatorBalanceResult = contractInstance.try_erc20Balance(event.params.token, creatorAddress)
  let treasuryBalanceResult = contractInstance.try_erc20Balance(event.params.token, treasuryAddress)
  
  if (!creatorBalanceResult.reverted) {
    balance.creatorBalance = creatorBalanceResult.value
  }
  if (!treasuryBalanceResult.reverted) {
    balance.treasuryBalance = treasuryBalanceResult.value
  }
  
  // Create token withdraw entity
  let withdrawId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let withdraw = new RoyaltyTokenWithdraw(withdrawId)
  withdraw.splitter = splitter.id
  withdraw.token = event.params.token
  withdraw.to = event.params.to
  withdraw.amount = event.params.amount
  withdraw.timestamp = event.block.timestamp
  withdraw.blockNumber = event.block.number
  withdraw.transactionHash = event.transaction.hash
  
  withdraw.save()
  balance.save()
  splitter.save()
}

// ============ Marketplace Event Handlers ============

// Helper function to ensure Marketplace exists
function ensureMarketplace(marketplaceAddress: Address): Marketplace {
  let marketplaceId = marketplaceAddress.toHexString()
  let marketplace = Marketplace.load(marketplaceId)
  if (marketplace == null) {
    marketplace = new Marketplace(marketplaceId)
    let contractInstance = MarketplaceContract.bind(marketplaceAddress)
    
    // Load initial state from contract
    let feeTreasuryResult = contractInstance.try_feeTreasury()
    let feeBpsResult = contractInstance.try_marketplaceFeeBps()
    let accruedFeesResult = contractInstance.try_accruedFees()
    let lastListingIdResult = contractInstance.try_lastListingId()
    
    if (!feeTreasuryResult.reverted) {
      marketplace.feeTreasury = feeTreasuryResult.value
    } else {
      marketplace.feeTreasury = Bytes.fromHexString('0x0000000000000000000000000000000000000000')
    }
    
    if (!feeBpsResult.reverted) {
      marketplace.marketplaceFeeBps = BigInt.fromI32(feeBpsResult.value.toI32())
    } else {
      marketplace.marketplaceFeeBps = BigInt.fromI32(0)
    }
    
    if (!accruedFeesResult.reverted) {
      marketplace.accruedFees = accruedFeesResult.value
    } else {
      marketplace.accruedFees = BigInt.fromI32(0)
    }
    
    if (!lastListingIdResult.reverted) {
      marketplace.lastListingId = lastListingIdResult.value
    } else {
      marketplace.lastListingId = BigInt.fromI32(0)
    }
    
    marketplace.createdAt = BigInt.fromI32(0)
    marketplace.blockNumber = BigInt.fromI32(0)
    marketplace.transactionHash = Bytes.fromHexString('0x0000000000000000000000000000000000000000000000000000000000000000')
    marketplace.save()
  }
  return marketplace as Marketplace
}

export function handleListed(event: ListedEvent): void {
  let marketplaceAddress = event.address
  let marketplace = ensureMarketplace(marketplaceAddress)
  
  // Update marketplace state
  let contractInstance = MarketplaceContract.bind(marketplaceAddress)
  let lastListingIdResult = contractInstance.try_lastListingId()
  if (!lastListingIdResult.reverted) {
    marketplace.lastListingId = lastListingIdResult.value
  }
  marketplace.blockNumber = event.block.number
  marketplace.transactionHash = event.transaction.hash
  
  let listingId = event.params.listingId
  let listingEntityId = listingId.toString()
  let seller = event.params.seller
  let nftAddress = event.params.nft
  let tokenId = event.params.tokenId
  let price = event.params.price
  
  // Ensure accounts exist
  let sellerAccount = ensureAccount(seller)
  
  // Load or create token entity
  let tokenEntityId = tokenId.toString()
  let token = Token.load(tokenEntityId)
  if (token == null) {
    // Token might not exist yet, create a minimal one
    // This shouldn't happen in practice, but handle it gracefully
    return
  }
  
  // Create listing entity
  let listing = new Listing(listingEntityId)
  listing.listingId = listingId
  listing.marketplace = marketplace.id
  listing.seller = sellerAccount.id
  listing.nft = nftAddress
  listing.token = token.id
  listing.tokenId = tokenId
  listing.price = price
  listing.active = true
  listing.createdAt = event.block.timestamp
  listing.updatedAt = null
  listing.canceledAt = null
  listing.blockNumber = event.block.number
  listing.transactionHash = event.transaction.hash
  
  listing.save()
  marketplace.save()
}

export function handleListingUpdated(event: ListingUpdatedEvent): void {
  let listingId = event.params.listingId
  let listingEntityId = listingId.toString()
  let newPrice = event.params.newPrice
  
  let listing = Listing.load(listingEntityId)
  if (listing == null) {
    return
  }
  
  listing.price = newPrice
  listing.updatedAt = event.block.timestamp
  
  listing.save()
}

export function handleListingCanceled(event: ListingCanceledEvent): void {
  let listingId = event.params.listingId
  let listingEntityId = listingId.toString()
  
  let listing = Listing.load(listingEntityId)
  if (listing == null) {
    return
  }
  
  listing.active = false
  listing.canceledAt = event.block.timestamp
  
  listing.save()
}

export function handlePurchased(event: PurchasedEvent): void {
  let marketplaceAddress = event.address
  let marketplace = ensureMarketplace(marketplaceAddress)
  
  // Update marketplace accrued fees
  let contractInstance = MarketplaceContract.bind(marketplaceAddress)
  let accruedFeesResult = contractInstance.try_accruedFees()
  if (!accruedFeesResult.reverted) {
    marketplace.accruedFees = accruedFeesResult.value
  }
  marketplace.blockNumber = event.block.number
  marketplace.transactionHash = event.transaction.hash
  
  let listingId = event.params.listingId
  let listingEntityId = listingId.toString()
  let buyer = event.params.buyer
  let price = event.params.price
  let royaltyReceiver = event.params.royaltyReceiver
  let royaltyAmount = event.params.royaltyAmount
  let feeAmount = event.params.feeAmount
  let sellerAmount = event.params.sellerAmount
  
  // Load listing
  let listing = Listing.load(listingEntityId)
  if (listing == null) {
    return
  }
  
  // Mark listing as inactive
  listing.active = false
  
  // Load token
  let token = Token.load(listing.token)
  if (token == null) {
    return
  }
  
  // Ensure buyer account exists
  let buyerAccount = ensureAccount(buyer)
  
  // Create purchase entity
  let purchaseId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let purchase = new Purchase(purchaseId)
  purchase.marketplace = marketplace.id
  purchase.listing = listing.id
  purchase.listingId = listingId
  purchase.buyer = buyerAccount.id
  purchase.token = token.id
  purchase.price = price
  purchase.royaltyReceiver = royaltyReceiver
  purchase.royaltyAmount = royaltyAmount
  purchase.feeAmount = feeAmount
  purchase.sellerAmount = sellerAmount
  purchase.timestamp = event.block.timestamp
  purchase.blockNumber = event.block.number
  purchase.transactionHash = event.transaction.hash
  
  // Link purchase to listing
  listing.purchase = purchase.id
  
  purchase.save()
  listing.save()
  marketplace.save()
}

export function handleFeeWithdrawn(event: FeeWithdrawnEvent): void {
  let marketplaceAddress = event.address
  let marketplace = ensureMarketplace(marketplaceAddress)
  
  // Update marketplace accrued fees
  let contractInstance = MarketplaceContract.bind(marketplaceAddress)
  let accruedFeesResult = contractInstance.try_accruedFees()
  if (!accruedFeesResult.reverted) {
    marketplace.accruedFees = accruedFeesResult.value
  }
  marketplace.blockNumber = event.block.number
  marketplace.transactionHash = event.transaction.hash
  
  // Create fee withdrawal entity
  let withdrawalId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  let withdrawal = new FeeWithdrawal(withdrawalId)
  withdrawal.marketplace = marketplace.id
  withdrawal.to = event.params.to
  withdrawal.amount = event.params.amount
  withdrawal.timestamp = event.block.timestamp
  withdrawal.blockNumber = event.block.number
  withdrawal.transactionHash = event.transaction.hash
  
  withdrawal.save()
  marketplace.save()
}
