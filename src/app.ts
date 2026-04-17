import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './config/swagger.json';
import prisma from '../lib/prisma'
import router from './routes';
const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/v1', router);

// Swagger Docs Setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Check db connection
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'success',
      message: 'API and Database are running sequentially',
    });
  } catch (error) {
    console.error('Database connection failed', error);
    res
      .status(500)
      .json({ status: 'error', message: 'Database connection failed' });
  }
});

export default app;
