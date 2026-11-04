import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { paymentLabels } from "@/validation/checkout-validation";
import { prisma } from "@/server/database/prisma";
import StoreShell from "../store/store-shell";
export default function Orders() {return <StoreShell><section className="store-page-heading"><p className="eyebrow">YOUR FRESH JOURNEY</p><h1>Your orders.</h1><p>All the goodness you’ve ordered, in one place.</p></section><section className="store-section"><Suspense fallback={<p role="status">Loading your orders…</p>}><OrderHistory /></Suspense></section></StoreShell>;}
async function OrderHistory() {
  await connection();const user=await getCurrentUser();if(!user)redirect("/login");
  const orders=await prisma.order.findMany({where:{userId:user.id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:50,select:{id:true,createdAt:true,status:true,paymentStatus:true,total:true,items:{select:{id:true,name:true,optionLabel:true,quantity:true,subtotal:true}}}});
  const money=(value:number)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN"}).format(value/100);
  return orders.length ? <div className="order-list"><p className="muted">Your 50 most recent orders</p>{orders.map(order=><article className="order-history-card" key={order.id}><header><div><Link href={`/orders/${order.id}`}><strong>Order {order.id.slice(0,8).toUpperCase()} →</strong></Link><p>{order.createdAt.toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric",timeZone:"Africa/Lagos"})}</p></div><span className="status-pill available">{order.status.toLowerCase().replaceAll("_"," ")}</span></header>{order.items.map(item=><div className="order-history-line" key={item.id}><span>{item.quantity} × {item.name}<small>{item.optionLabel}</small></span><strong>{money(item.subtotal)}</strong></div>)}<footer><span>Payment: {paymentLabels[order.paymentStatus] ?? order.paymentStatus}</span><strong>Total {money(order.total)}</strong></footer></article>)}</div>:<div className="empty-state"><span className="empty-symbol">▤</span><h2>Your story is just getting started.</h2><p>Your saved orders will appear here. Explore the shop to find your favourites.</p><Link href="/shop" className="button button-primary">Browse the collection →</Link></div>;
}
