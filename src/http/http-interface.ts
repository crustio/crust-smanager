import express from 'express';
import { Logger } from 'winston';
import { AppContext } from '../types/context';


export async function startHttp(
    context: AppContext,
    loggerParent: Logger,
) {
    const logger = loggerParent.child({ moduleId: "http" });
    const app = express();
    const PORT = 42087;

    app.post('/api/v0/insert', async (req, res) => {
        const cid = req.body['cid'];
        if (!cid) {
            return res.status(400).send('Please provide cid in the request');
        }
        logger.info("Try to insert pinning job: %s", cid);

        const fi = await context.api.maybeGetFileUsedInfo(cid);
        if (!fi) {
            return res.status(400).send('Please provide ordered cid');
        }
        
        return res.status(200).send('Success');
    });

    app.listen(PORT, () => {
        console.log(`Express with Typescript! http://localhost:${PORT}`);
    });
}

