## Database Schemas

## config table
  table to save some config data

  - name [string]
  - content [long text]
## FileRecord table
  - id  [number]
  - cid [string]

    file cid
  - expireAt [number]

    the block number the file expires
  - size [number]

    file size
  - amount [number]

    reward amount
  - replicas [number]

    total replicas
  - indexer [string]

    the indexer id which inserts this record

  - status [string]

    the file status - handled/skipped/invalid etc
  - lastUpdated [number/timestamp]

    the timestamp when this record was updated
  - createAt [number/timestamp]

    the timestamp when this record was created

## PinRecord table
  pin history
  - id [number]
  - cid [string]
  - pinAt [number/timestamp]
  - pinBy [string]

## File Owners table
  file and owner account relations
  - id [number]
  - cid [string]
  - owner [string]
  - createAt [number/timestamp]

## Cleanup Record table
  records for files to be cleaned up
  - id [number]
  - cid [string]
  - status [string]
  - lastUpdated [number/timestamp]
  - createAt [number/timestamp]
