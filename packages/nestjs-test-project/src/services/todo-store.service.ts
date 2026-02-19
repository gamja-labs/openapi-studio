import { Injectable } from '@nestjs/common';
import { ObjectId } from 'bson';
import { TodoList } from '../models';
import { TodoItem } from '../models';

@Injectable()
export class TodoStoreService {
    private todoLists: Map<string, TodoList.Entity> = new Map();
    private todoItems: Map<string, TodoItem.Entity> = new Map();

    // TodoList methods
    createList(data: Omit<TodoList.Entity, '_id' | 'created_at' | 'updated_at'>): TodoList.Entity {
        const id = new ObjectId().toString();
        const now = new Date();
        const list: TodoList.Entity = {
            _id: id,
            ...data,
            created_at: now,
            updated_at: now,
        };
        this.todoLists.set(id, list);
        return list;
    }

    getList(id: string): TodoList.Entity | undefined {
        return this.todoLists.get(id);
    }

    getAllLists(): TodoList.Entity[] {
        return Array.from(this.todoLists.values());
    }

    updateList(id: string, updates: Partial<Omit<TodoList.Entity, '_id' | 'created_at'>>): TodoList.Entity | undefined {
        const list = this.todoLists.get(id);
        if (!list) {
            return undefined;
        }
        const updated: TodoList.Entity = {
            ...list,
            ...updates,
            updated_at: new Date(),
        };
        this.todoLists.set(id, updated);
        return updated;
    }

    deleteList(id: string): boolean {
        // Delete all items in the list
        const items = this.getAllItems().filter(item => item.list_id === id);
        items.forEach(item => this.todoItems.delete(item._id));
        
        return this.todoLists.delete(id);
    }

    // TodoItem methods
    createItem(data: Omit<TodoItem.Entity, '_id' | 'created_at' | 'updated_at'>): TodoItem.Entity {
        const id = new ObjectId().toString();
        const now = new Date();
        const item: TodoItem.Entity = {
            _id: id,
            ...data,
            completed: data.completed ?? false,
            created_at: now,
            updated_at: now,
        };
        this.todoItems.set(id, item);
        return item;
    }

    getItem(id: string): TodoItem.Entity | undefined {
        return this.todoItems.get(id);
    }

    getItemsByListId(listId: string): TodoItem.Entity[] {
        return Array.from(this.todoItems.values()).filter(item => item.list_id === listId);
    }

    getAllItems(): TodoItem.Entity[] {
        return Array.from(this.todoItems.values());
    }

    updateItem(id: string, updates: Partial<Omit<TodoItem.Entity, '_id' | 'created_at'>>): TodoItem.Entity | undefined {
        const item = this.todoItems.get(id);
        if (!item) {
            return undefined;
        }
        const updated: TodoItem.Entity = {
            ...item,
            ...updates,
            updated_at: new Date(),
        };
        this.todoItems.set(id, updated);
        return updated;
    }

    deleteItem(id: string): boolean {
        return this.todoItems.delete(id);
    }
}
