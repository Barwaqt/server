import { db } from "../config/database.js";
export const list = (user) =>
  db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
export const markRead = (user, id) =>
  db.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
