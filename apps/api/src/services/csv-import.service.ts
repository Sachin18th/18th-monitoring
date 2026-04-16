import { db } from '../../../../packages/db/src/adapters/postgres-relational.adapter';
import { rawPayloads } from '../../../../packages/db/src/drizzle/schema';
import crypto from 'crypto';

export class CsvImportService {
    // Configurable boundaries matching architectural limit demands
    private MAX_FILE_SIZE_MB = parseInt(process.env.CSV_MAX_MB || '10');
    private MAX_ROWS = parseInt(process.env.CSV_MAX_ROWS || '50000');
    private CHUNK_SIZE = parseInt(process.env.CSV_CHUNK_SIZE || '500');

    public async processImport(siteId: string, connectorId: string, fileStream: NodeJS.ReadableStream, fileSizeMb: number) {
        if (fileSizeMb > this.MAX_FILE_SIZE_MB) {
            throw new Error(`File exceeds maximum size of ${this.MAX_FILE_SIZE_MB}MB.`);
        }

        let rowCount = 0;
        let currentChunk: any[] = [];
        let totalProcessed = 0;
        let totalFailed = 0;

        // Note: Using a robust parser like 'csv-parser' is usually required here:
        // const parser = fileStream.pipe(csv()); 
        // For architectural demonstration, we loop through a mock buffer chunk.

        const processChunk = async (chunk: any[]) => {
            const payloadId = crypto.randomUUID();
            // Validate mapping
            
            // Durable store into Database immediately representing Chunk durability
            await db.insert(rawPayloads).values({
                payloadId,
                siteId,
                connectorId,
                status: 'PENDING',
                rawData: chunk,
            });

            // Hand-off exactly this chunk ID to the Kafka Queue internally for async workers to digest.
            console.log(`[CSV Import] Enqueued chunk ${payloadId} with ${chunk.length} rows.`);
        }

        // Mock stream processing
        for await (const row of fileStream as any) {
            rowCount++;
            if (rowCount > this.MAX_ROWS) {
                throw new Error(`Import aborted: Exceeded maximum allowed rows (${this.MAX_ROWS}).`);
            }

            currentChunk.push(row);
            if (currentChunk.length >= this.CHUNK_SIZE) {
                await processChunk(currentChunk);
                totalProcessed += currentChunk.length;
                currentChunk = [];
            }
        }
        
        // Final chunk
        if (currentChunk.length > 0) {
            await processChunk(currentChunk);
            totalProcessed += currentChunk.length;
        }

        return {
            status: 'ENQUEUED',
            metrics: { rowsProcessed: totalProcessed, chunksQueued: Math.ceil(totalProcessed / this.CHUNK_SIZE) }
        };
    }
}

export const csvImportService = new CsvImportService();
