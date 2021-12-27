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

    app.get('/api/v0/pin', (req, res) => {
        logger.info("xxxxxxxxxxxxxxxx");
        res.send('Hello world');
    });

    app.listen(PORT, () => {
        console.log(`Express with Typescript! http://localhost:${PORT}`);
    });
}

