// Temporarily disabled: Prisma schema does not currently define this model delegate.
// import type { PrismaClient } from "../../generated/prisma/client";
// import { BaseRepository } from "../../shared/repositories/base.repository";
// import prisma from "../../config/prisma";
// 
// export class TransactionRepository extends BaseRepository<PrismaClient["transaction"]> {
//   constructor() {
//     super(prisma.transaction);
//   }
// 
//   /**
//    * Convenience method — find by primary key id.
//    * Entity-specific query methods should be added here as the application grows.
//    */
//   async findById(id: string) {
//     return this.findUnique({ where: { id } });
//   }
// }
// 
// export const transactionRepository = new TransactionRepository();
