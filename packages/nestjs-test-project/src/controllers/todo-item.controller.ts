import { Controller, Get, Post, Put, Delete, Param, Body, Logger, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import {
    CreateTodoItemDto,
    UpdateTodoItemDto,
    TodoItemResponseDto,
    TodoItemListQueryDto,
    TodoItemListResponseDto,
} from '../dto/todo.dto';
import { TodoItemByIdPipe } from '../pipes';
import { TodoItem } from '../models';
import { TodoStoreService } from '../services/todo-store.service';

@ApiTags('todo-items')
@Controller('todo-items')
export class TodoItemController {
    private readonly logger = new Logger(TodoItemController.name);

    constructor(
        private readonly todoStore: TodoStoreService
    ) { }

    @Post()
    @ApiOperation({ summary: 'Create a new todo item in a list' })
    @ApiCreatedResponse({
        description: 'Todo item created successfully.',
        type: TodoItemResponseDto,
    })
    @ApiNotFoundResponse({ description: 'Todo list not found.' })
    createItem(
        @Body() createDto: CreateTodoItemDto,
    ): TodoItemResponseDto {
        const todoList = this.todoStore.getList(createDto.list_id);
        if (!todoList) {
            throw new NotFoundException('Todo list not found');
        }
        this.logger.log(`Creating todo item in list: ${createDto.list_id}`);
        const result = this.todoStore.createItem(createDto);
        return result;
    }

    @Get()
    @ApiOperation({ summary: 'Get all todo items in a list' })
    @ApiOkResponse({
        description: 'List of all todo items in the list.',
        type: [TodoItemResponseDto],
    })
    @ApiNotFoundResponse({ description: 'Todo list not found.' })
    getItemsByListId(@Query() query: TodoItemListQueryDto): TodoItemListResponseDto {
        const todoList = this.todoStore.getList(query.list_id);
        if (!todoList) {
            throw new NotFoundException('Todo list not found');
        }
        this.logger.log(`Getting all items for list: ${todoList._id}`);
        const result = this.todoStore.getItemsByListId(todoList._id);
        return {
            items: result,
            count: result.length,
        };
    }

    @Get(':itemId')
    @ApiParam({ name: 'itemId', description: 'Todo item ID' })
    @ApiOperation({ summary: 'Get a todo item by ID' })
    @ApiOkResponse({
        description: 'Todo item found.',
        type: TodoItemResponseDto,
    })
    @ApiNotFoundResponse({ description: 'Todo item not found.' })
    getItemById(
        @Param('itemId', TodoItemByIdPipe) item: TodoItem.Entity,
    ): TodoItemResponseDto {
        return item;
    }

    @Put(':itemId')
    @ApiParam({ name: 'itemId', description: 'Todo item ID' })
    @ApiOperation({ summary: 'Update a todo item' })
    @ApiOkResponse({
        description: 'Todo item updated successfully.',
        type: TodoItemResponseDto,
    })
    @ApiNotFoundResponse({ description: 'Todo item not found.' })
    updateItem(
        @Param('itemId', TodoItemByIdPipe) item: TodoItem.Entity,
        @Body() updateDto: UpdateTodoItemDto,
    ): TodoItemResponseDto {
        this.logger.log(`Updating todo item: ${item._id}`);
        const result = this.todoStore.updateItem(item._id, updateDto);
        if (!result) {
            throw new NotFoundException(`Todo item with ID ${item._id} not found`);
        }
        return result;
    }

    @Delete(':itemId')
    @ApiParam({ name: 'itemId', description: 'Todo item ID' })
    @ApiOperation({ summary: 'Delete a todo item' })
    @ApiOkResponse({ description: 'Todo item deleted successfully.' })
    @ApiNotFoundResponse({ description: 'Todo item not found.' })
    deleteItem(
        @Param('itemId', TodoItemByIdPipe) item: TodoItem.Entity,
    ): void {
        this.logger.log(`Deleting todo item: ${item._id}`);
        this.todoStore.deleteItem(item._id);
    }
}

