# crust-smanager
sManager (Storage Manager) is a file picking bot which continuously picking and handling files from Crust Network. Node operators can customize this module to implement their own file handling strategy. sManager maintains a local database to help making decision on pulling files.

## Local Database
The local database stores below information:
1. **File Records**: The files metadata(tips, size, replicas count, expire time etc.) on Crust Network.
2. **File and Owner Relationship**: sManager also maintains the relationship between a file and an on-chain account. This information will help making better pulling decision.
3. **Chain Metadata**: e.g. the block and time on chain.
4. **Pin Records**: The pin history of files.
5. **Cleanup Records**: The files needs to removed from local filesystem, normally this is triggered when a file expires on Crust Network.

Checkout [Db Schema](db-schema.md) for the schema details.

## Components
sManager was designed to have serveral tasks running independently. Tasks are either scheduled by the block event or by configured intervals. Each task plays as an actor which consumes/produces some information and communicate with other tasks through the db or applicaion context.

sManager follows the **Fails Early** priciple which means it will shutdown on any unexpected error. To support this priciple, tasks are designed to be recoverable after application restarts.

Below are a list of components that sManager has implemented.
### Indexers
Indexers extract information into the local database from various data sources. Currently sManager has implemented below indexers:
1. **Chain Database Indexer**: indexes file records from the Crust Network on-chain database.
2. **Chain Event Indexer**: indexes file records by listening latest chain event.
3. **Chain Time Indexer**: a simple indexer which push the latest block height and it's timestamp to the config table.

### Simple Tasks
Simple tasks are speciualized tasks which runs periodly. Currently sManager has implemented below tasks:
1. **Group Info Updater**: Update sworker identity information from sworker api.
2. **Ipfs Gc**: Schedule ipfs gc periodly.
3. **Telemetry Reporting**: Report smanager statistics information to the telemetry server.
4. **Pull Scheduler**: Schedule file pulling based on configured strategey.
5. **Seal Status Updater**: Update sealing status periodly.
6. **File Retry Task**: Retry pulling if possible.
7. **File Cleanup Task**: Cleanup deleted files from local filesystem.

## Usage

1. Clone repo

```shell
git clone https://github.com/crustio/crust-smanager.git
```

2. Installing
It's recommended to use `volta` as the node version manager. Please follow the [volta docs](https://docs.volta.sh/guide/getting-started) to install it.

```shell
cd crust-smanager && npm i
```

3. Debug

```shell
npm run dev
```

4. Run in Prod
```shell
npm run build
npm start
```

It's recommended to run sManager using Docker with the `restart=always` restart policy.

A daemon guard should be configured if you want to run sManager natively without docker. Tools like `pm2` and `nodemon` could be used.


## Configuration
Checkout [smanager-config.example.json](data/smanager-config.example.json)