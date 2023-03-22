//
// indexers types
// dbScan - indexer by scanning the market.Files map
// chainEvent - indexer by subscribing to the latest storage orders events
// wanted - trigger by user
export type Indexer = 'dbScan' | 'chainEvent' | 'wanted';
