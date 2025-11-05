import {
  ethereum,
  BigInt,
  Address,
  Bytes
} from '@graphprotocol/graph-ts'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

import {
  Listed as ListedEvent,
  ListingUpdated as ListingUpdatedEvent,
  ListingCanceled as ListingCanceledEvent,
  Purchased as PurchasedEvent
} from '../generated/Marketplace/Marketplace'


import {
  Account,
  Listing
} from '../generated/schema'

/**
 * Ensure an Account entity exists for a given address and return it.
 */
function ensureAccount(addr: Address): Account {
  let id = addr.toHex();
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.save();
  }
  return account as Account;
}

/**
 * Ensure an Account entity exists for a given address string and return it 
 */
function ensureAccountFromString(address: string): Account {
  let account = Account.load(address);
  if (account == null) {
    account = new Account(address);
    account.save();
  }
  return account as Account;
}

/**
 * Marketplace event handlers
 */
export function handleListed(ev: ListedEvent): void {
  let id = ev.params.listingId.toString();
  let listing = Listing.load(id);
  if (listing == null) {
    listing = new Listing(id);
  }

  // set basic fields
  listing.listingId = ev.params.listingId;
  listing.seller = ensureAccount(ev.params.seller).id;
  listing.nft = ev.params.nft;
  listing.tokenId = ev.params.tokenId;
  listing.price = ev.params.price;
  listing.active = true;
  listing.buyer = null;
  listing.created = ev.block.timestamp;
  listing.updated = ev.block.timestamp;
  listing.transaction = ev.transaction.hash;
  listing.blockNumber = ev.block.number;
  listing.save();
}

export function handleListingUpdated(ev: ListingUpdatedEvent): void {
  let id = ev.params.listingId.toString();
  let listing = Listing.load(id);
  if (listing == null) {
    // If we didn't see a Listed event (e.g. started indexing mid-history), create anyway
    listing = new Listing(id);
    listing.listingId = ev.params.listingId;
    listing.seller = ensureAccountFromString(ZERO_ADDRESS).id;
    listing.nft = Bytes.fromHexString(ZERO_ADDRESS);
    listing.tokenId = BigInt.fromI32(0);
    listing.created = ev.block.timestamp;
  }
  listing.price = ev.params.newPrice;
  listing.updated = ev.block.timestamp;
  listing.transaction = ev.transaction.hash;
  listing.blockNumber = ev.block.number;
  listing.save();
}

export function handleListingCanceled(ev: ListingCanceledEvent): void {
  let id = ev.params.listingId.toString();
  let listing = Listing.load(id);
  if (listing == null) {
    // create a placeholder to mark as inactive
    listing = new Listing(id);
    listing.listingId = ev.params.listingId;
    listing.seller = ensureAccountFromString(ZERO_ADDRESS).id;
    listing.nft = Bytes.fromHexString(ZERO_ADDRESS);
    listing.tokenId = BigInt.fromI32(0);
    listing.created = ev.block.timestamp;
  }
  listing.active = false;
  listing.updated = ev.block.timestamp;
  listing.transaction = ev.transaction.hash;
  listing.blockNumber = ev.block.number;
  listing.save();
}

export function handlePurchased(ev: PurchasedEvent): void {
  let id = ev.params.listingId.toString();
  let listing = Listing.load(id);
  if (listing == null) {
    // create a placeholder if missing
    listing = new Listing(id);
    listing.listingId = ev.params.listingId;
    listing.seller = ensureAccountFromString(ZERO_ADDRESS).id;
    listing.nft = Bytes.fromHexString(ZERO_ADDRESS);
    listing.tokenId = BigInt.fromI32(0);
    listing.created = ev.block.timestamp;
  }
  listing.active = false;
  listing.buyer = ensureAccount(ev.params.buyer).id;
  listing.purchasedAt = ev.block.timestamp;
  listing.updated = ev.block.timestamp;
  listing.transaction = ev.transaction.hash;
  listing.blockNumber = ev.block.number;
  // Purchase details
  listing.royaltyReceiver = ev.params.royaltyReceiver;
  listing.royaltyAmount = ev.params.royaltyAmount;
  listing.feeAmount = ev.params.feeAmount;
  listing.sellerAmount = ev.params.sellerAmount;
  listing.save();
}