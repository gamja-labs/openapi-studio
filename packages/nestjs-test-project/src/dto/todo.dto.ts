import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { entitySchema as TodoListEntitySchema } from '../models/todo-list';
import { entitySchema as TodoItemEntitySchema } from '../models/todo-item';

const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

// Internal fields that should be omitted from create/update DTOs
const InternalFields = ['_id', 'created_at', 'updated_at'] as const;

// Todo List Schemas
export const CreateTodoListSchema = TodoListEntitySchema.omit({ _id: true, created_at: true, updated_at: true });
export class CreateTodoListDto extends createZodDto(CreateTodoListSchema) { }

export const UpdateTodoListSchema = TodoListEntitySchema.omit({ _id: true, created_at: true, updated_at: true }).partial();
export class UpdateTodoListDto extends createZodDto(UpdateTodoListSchema) { }

export const TodoListResponseSchema = TodoListEntitySchema;
export class TodoListResponseDto extends createZodDto(TodoListResponseSchema) { }

export const TodoListListResponseSchema = z.object({
    items: z.array(TodoListEntitySchema),
    count: z.number(),
});
export class TodoListListResponseDto extends createZodDto(TodoListListResponseSchema) { }

// Todo Item Schemas
export const CreateTodoItemSchema = TodoItemEntitySchema.omit({ _id: true, created_at: true, updated_at: true });
export class CreateTodoItemDto extends createZodDto(CreateTodoItemSchema) { }

export const UpdateTodoItemSchema = TodoItemEntitySchema.omit({ _id: true, created_at: true, updated_at: true }).partial();
export class UpdateTodoItemDto extends createZodDto(UpdateTodoItemSchema) { }

export const TodoItemResponseSchema = TodoItemEntitySchema;
export class TodoItemResponseDto extends createZodDto(TodoItemResponseSchema) { }

export const TodoItemListResponseSchema = z.object({
    items: z.array(TodoItemEntitySchema),
    count: z.number(),
});
export class TodoItemListResponseDto extends createZodDto(TodoItemListResponseSchema) { }

export const TodoItemListQuerySchema = z.object({
    list_id: ObjectIdSchema,
});
export class TodoItemListQueryDto extends createZodDto(TodoItemListQuerySchema) { }


