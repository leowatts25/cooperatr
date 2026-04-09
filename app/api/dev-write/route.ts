import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }
  const { filePath, content } = await req.json();
  const fullPath = path.join(process.cwd(), filePath);
  fs.writeFileSync(fullPath, content, 'utf-8');
  return NextResponse.json({ ok: true, path: fullPath });
}
