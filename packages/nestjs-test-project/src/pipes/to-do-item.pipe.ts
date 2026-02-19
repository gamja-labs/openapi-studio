import { Injectable, PipeTransform, ArgumentMetadata, NotFoundException } from '@nestjs/common';
import { TodoItem } from '../models';
import { TodoStoreService } from '../services/todo-store.service';

@Injectable()
export class TodoItemByIdPipe implements PipeTransform<string, TodoItem.Entity> {
    constructor(
        private readonly todoStore: TodoStoreService
    ) { }

    transform(value: string, metadata: ArgumentMetadata): TodoItem.Entity {
        const item = this.todoStore.getItem(value);
        if (!item) {
            throw new NotFoundException(`Todo item with ID ${value} not found`);
        }
        return item;
    }
}