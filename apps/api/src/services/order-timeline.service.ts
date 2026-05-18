import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { CanonicalOrder, LifecycleState } from './order-normalization.service';
import crypto from 'crypto';

/**
 * OrderTimelineService
 * 
 * Objective:
 * Management of order lifecycle events and state snapshots.
 * Ensures we can tell the story of an order from Placed -> Paid -> Shipped.
 */
export class OrderTimelineService {
    
    /**
     * Records a change in the order state.
     * Compares the new canonical state with the existing one to detect transitions.
     */
    static async recordTransition(newOrder: CanonicalOrder) {
        const existingOrder = GlobalMemoryStore.orders.get(newOrder.orderId);
        
        // 1. Update the main Canonical representation
        GlobalMemoryStore.orders.set(newOrder.orderId, newOrder);

        // 2. Detect and Record Lifecycle Events
        if (!existingOrder || existingOrder.lifecycleState !== newOrder.lifecycleState) {
            const event = {
                id: crypto.randomUUID(),
                orderInternalId: newOrder.id,
                orderId: newOrder.orderId,
                eventType: `LIFECYCLE_${newOrder.lifecycleState}`,
                timestamp: new Date().toISOString(),
                prevValue: existingOrder?.lifecycleState || 'NONE',
                newValue: newOrder.lifecycleState,
                metadata: { siteId: newOrder.siteId }
            };

            // In real DB, this goes to 'order_events' table
            if (!GlobalMemoryStore.events) GlobalMemoryStore.events = [];
            GlobalMemoryStore.events.push(event);
            
            console.log(`[TIMELINE] Order ${newOrder.orderId} transitioned: ${event.prevValue} -> ${event.newValue}`);
        }

        // 3. Create a Periodic Snapshot (Demo: Every update is a snapshot)
        const snapshot = {
            id: Date.now(),
            orderInternalId: newOrder.id,
            snapshotTimestamp: new Date().toISOString(),
            lifecycleState: newOrder.lifecycleState,
            totalAmount: newOrder.totalAmount,
            metadata: newOrder.metadata
        };
        
        // In real DB, this goes to 'order_snapshots' table
        if (!GlobalMemoryStore.orderSnapshots) GlobalMemoryStore.orderSnapshots = [];
        GlobalMemoryStore.orderSnapshots.push(snapshot);
    }
}
