//
// indexers types
// dbScan - indexer by scanning the market.Files map
// chainEvent - indexer by subscribing to the latest storage orders events
// active - trigger by user
export type Indexer = 'dbScan' | 'chainEvent' | 'active';
