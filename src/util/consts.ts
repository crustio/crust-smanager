// Decision
// Base
export const SLOT_LENGTH = 300;

// Current MAX file replicas
export const MaxFileReplicas = 200;
// Base pin timeout
export const BasePinTimeout = 60 * 60 * 1000; // 60 minutes

// Pulling/Sealing Queue
export const MaxQueueLength = 5000;

//  Pull Queue Deal Max Length
export const PullQueueDealLength = 200;

// IPFS Queue Limits
export const IPFSQueueLimits = [250, 500];

// IPFS different files' max size: 5GB
export const IPFSFilesMaxSize = [1024 * 1024 * 1024 * 5];

// Expired queue duration
export const ExpiredQueueBlocks = 28800;

// Group Signs
export const MEMBER = 'member';
export const ISOLATION = 'isolation';
