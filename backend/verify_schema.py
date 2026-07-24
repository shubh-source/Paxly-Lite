import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy.ext.asyncio import create_async_engine
from app.models.orm import Base
import ssl

async def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    engine = create_async_engine(os.getenv('DATABASE_URL'), connect_args={'ssl': ctx})
    
    try:
        async with engine.begin() as conn:
            from sqlalchemy import inspect
            
            def check(sync_conn):
                inspector = inspect(sync_conn)
                db_tables = inspector.get_table_names()
                
                missing = []
                for table_name, table in Base.metadata.tables.items():
                    if table_name not in db_tables:
                        missing.append(f"Table missing: {table_name}")
                        continue
                        
                    db_columns = [col['name'] for col in inspector.get_columns(table_name)]
                    for column in table.columns:
                        if column.name not in db_columns:
                            missing.append(f"Column missing: {table_name}.{column.name}")
                            
                return missing
            
            missing_items = await conn.run_sync(check)
            
            if missing_items:
                print("MISSING ITEMS FOUND IN DATABASE:")
                for item in missing_items:
                    print(f"- {item}")
            else:
                print("DATABASE SCHEMA IS PERFECT! All tables and columns exist.")
                
    except Exception as e:
        print(f"FAILED: {e}")
        
    await engine.dispose()

asyncio.run(main())
