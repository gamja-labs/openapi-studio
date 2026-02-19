import { Injectable } from '@nestjs/common';
import { TodoStoreService } from './todo-store.service';

@Injectable()
export class TodoListService {
    constructor(
        private readonly todoStore: TodoStoreService
    ) { }

    deleteList(id: string): void {
        this.todoStore.deleteList(id);
    }
}

