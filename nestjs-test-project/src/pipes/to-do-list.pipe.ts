import { Injectable, PipeTransform, ArgumentMetadata, NotFoundException } from '@nestjs/common';
import { TodoList } from '../models';
import { TodoStoreService } from '../services/todo-store.service';

@Injectable()
export class TodoListByIdPipe implements PipeTransform<string, TodoList.Entity> {
    constructor(
        private readonly todoStore: TodoStoreService
    ) { }

    transform(value: string, metadata: ArgumentMetadata): TodoList.Entity {
        const list = this.todoStore.getList(value);
        if (!list) {
            throw new NotFoundException(`Todo list with ID ${value} not found`);
        }
        return list;
    }
}