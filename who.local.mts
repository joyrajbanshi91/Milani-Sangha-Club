import 'dotenv/config'
import { Client, TablesDB, Users, Query } from 'node-appwrite'
const c = new Client().setEndpoint(process.env.APPWRITE_ENDPOINT!).setProject(process.env.APPWRITE_PROJECT_ID!).setKey(process.env.APPWRITE_API_KEY!)
const { rows } = await new TablesDB(c).listRows({ databaseId: process.env.APPWRITE_DATABASE_ID!, tableId: 'payments', queries: [Query.limit(5)] })
for (const r of rows as any[]) console.log(' declaration', r.reference, 'by', r.memberName, r.memberUid)
