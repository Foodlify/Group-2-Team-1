// Temporarily disabled: Prisma schema does not currently define this model delegate.
// import type { PrismaClient } from "../../generated/prisma/client";
// import { BaseRepository } from "../../shared/repositories/base.repository";
// import prisma from "../../config/prisma";
// 
// export class TransactionDetailsRepository extends BaseRepository<PrismaClient["transactionDetails"]> {
//   constructor() {
//     super(prisma.transactionDetails);
//   }
// 
//   /**
//    * Convenience method — find by primary key transactionId.
//    * Entity-specific query methods should be added here as the application grows.
//    */
//   async findByTransactionId(transactionId: string) {
//     return this.findUnique({ where: { transactionId } });
//   }
// }
// 
// export const transactionDetailsRepository = new TransactionDetailsRepository();
