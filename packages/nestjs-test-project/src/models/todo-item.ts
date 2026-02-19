import { z } from 'zod';
import { DateTime } from './codecs';

const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

export const entitySchema = z.object({
    _id: ObjectIdSchema,
    list_id: ObjectIdSchema,
    text: z.string().min(1, 'Item text is required'),
    completed: z.boolean().optional().default(false),
    created_at: DateTime,
    updated_at: DateTime,
});

export type Entity = z.infer<typeof entitySchema>;