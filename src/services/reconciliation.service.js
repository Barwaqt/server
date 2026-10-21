import { db, transaction } from '../config/database.js';
export async function preview(vendorId) {
 return transaction(async tx => {
  const orders=await tx.vendorOrder.findMany({where:{vendorId,status:'DELIVERED',settlementId:null},select:{id:true,payableMinor:true,cashReceived:true,returnRequest:{select:{status:true}}}});
  const adjustments=await tx.vendorAdjustment.aggregate({where:{vendorId,settlementId:null},_sum:{amountMinor:true}});
  const eligible=orders.filter(o=>o.cashReceived&&(!o.returnRequest||['REJECTED','REFUNDED'].includes(o.returnRequest.status)));
  return {eligibleCount:eligible.length,awaitingPaymentCount:orders.filter(o=>!o.cashReceived).length,heldForReturnCount:orders.filter(o=>o.returnRequest&&!['REJECTED','REFUNDED'].includes(o.returnRequest.status)).length,adjustmentsMinor:adjustments._sum.amountMinor||0,amountMinor:eligible.reduce((n,o)=>n+o.payableMinor,0)+(adjustments._sum.amountMinor||0)};
 });
}
export async function riderBalances(){
 const [collected,received,riders]=await Promise.all([
 db.vendorOrder.groupBy({by:['riderId'],where:{riderId:{not:null}},_sum:{codCollectedMinor:true}}),
 db.remittance.groupBy({by:['riderId'],_sum:{amountMinor:true}}),
 db.user.findMany({where:{role:'RIDER'},select:{id:true,firstName:true,lastName:true}})
 ]);
 return riders.map(r=>{const collectedMinor=collected.find(c=>c.riderId===r.id)?._sum.codCollectedMinor||0;const receivedMinor=received.find(c=>c.riderId===r.id)?._sum.amountMinor||0;return {...r,collectedMinor,receivedMinor,outstandingMinor:collectedMinor-receivedMinor}});
}
