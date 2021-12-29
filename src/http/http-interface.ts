import express from 'express';
import { Logger } from 'winston';
import { AppContext } from '../types/context';
import * as bodyParser from 'body-parser';
import { FileInfo } from '../chain';
import { createFileOrderOperator } from '../db/file-record';
import { bytesToMb } from '../utils';
import { ChainFileInfo } from '../types/chain';
import BigNumber from 'bignumber.js';

export async function startHttp(
    context: AppContext,
    loggerParent: Logger,
): Promise<void> {
    const logger = loggerParent.child({ moduleId: "http" });
    const app = express();
    const PORT = 42087;
    const fileOrderOp = createFileOrderOperator(context.database);

    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
    app.use(bodyParser.json());

    logger.info("Configure smanager interface");

    app.post('/api/v0/insert', async (req, res) => {
        try {
            const cid = req.body['cid'];
            if (!cid) {
                return res.status(400).send('please provide cid in the request');
            }
            logger.info("try to insert wanted file: %s", cid);

            const file: any = await context.api.chainApi().query.market.files(cid); // eslint-disable-line
            if (file.isEmpty) {
                logger.warn('wanted file %s not exist on chain', cid);
                return res.status(400).send(`wanted file ${cid} not exist on chain`);
            }

            const fi = file.toJSON() as any; // eslint-disable-line
            const fileInfo = {
                ...fi,
                amount: new BigNumber(fi.amount.toString()),
            } as ChainFileInfo;

            logger.info(`wanted file chain info: ${JSON.stringify(fileInfo)}`);

            const sfi: FileInfo[] = [{
                cid,
                size: bytesToMb(fileInfo.file_size),
                tips: fileInfo.amount.toNumber(),
                owner: null,
                replicas: fileInfo.reported_replica_count,
                expiredAt: fileInfo.expired_at,
            }];

            await fileOrderOp.addFiles(sfi, 'wanted', true);
            return res.status(200).send(`insert wanted file: ${cid} success`);
        } catch (e) {
            return res.status(500).send("internal server error");
        }
    });

    app.listen(PORT, () => {
        logger.info(`Smanager interface run on http://localhost:${PORT}`);
    });
}
