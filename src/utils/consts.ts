// Decision
// Base
export const SLOT_LENGTH = 300;

// Current MAX file replicas
export const MaxFileReplicas = 200; // Mainnet max replicas

// System minumum free space(GB)
export const SysMinFreeSpace = 10; // 10 gigabytes

// Pulling/Sealing Queue
export const MaxQueueLength = 5000;

//  Pull Queue Deal Max Length
export const PullQueueDealLength = 200;

// IPFS Queue Limits
export const IPFSQueueLimits = [100, 200];

// IPFS different files' max size: 5GB
export const IPFSFilesMaxSize = [1024 * 1024 * 1024 * 5];

// Expired queue duration
export const ExpiredQueueBlocks = 28800;

// Group Signs
export const MEMBER = 'member';
export const ISOLATION = 'isolation';

// IPFS
// Base pin timeout
export const BasePinTimeout = 60 * 60 * 1000; // 60 minutes

// Repo GC timeout
export const IPFSGCTimeout = 6 * 60 * 60 * 1000; // 6 hours

// Repo gc loop interval
export const IPFSGCInterval = 60 * 60 * 1000; // 1 hour

export const LargeFileSize = 5 * 1024; // 5GB+ files are large files
