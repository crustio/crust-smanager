//
// indexers types
// dbScan - indexer by scanning the market.Files map
// chainEvent - indexer by subscribing to the latest storage orders events
export type Indexer = 'dbScan' | 'chainEvent';
