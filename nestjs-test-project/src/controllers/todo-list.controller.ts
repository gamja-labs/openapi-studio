import { Controller, Get, Post, Put, Delete, Param, Body, Logger, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import * as dto from '../dto/todo.dto';
import { TodoListByIdPipe } from '../pipes';
import { TodoList } from '../models';
import { TodoStoreService } from '../services/todo-store.service';
import { TodoListService } from '../services/todo-list.service';

@ApiTags('todo-lists')
@Controller('todo-lists')
export class TodoListController {
    private readonly logger = new Logger(TodoListController.name);

    constructor(
        private readonly todoStore: TodoStoreService,
        private readonly todoListService: TodoListService
    ) { }

    @Post()
    @ApiOperation({ summary: 'Create a new todo list' })
    @ApiCreatedResponse({
        description: 'Todo list created successfully.',
        type: dto.TodoListResponseDto,
    })
    createList(@Body() createDto: dto.CreateTodoListDto): dto.TodoListResponseDto {
        this.logger.log(`Creating todo list: ${createDto.name}`);
        const result = this.todoStore.createList({
            name: createDto.name,
        });
        return result;
    }

    @Get()
    @ApiOperation({ summary: 'Get all todo lists' })
    @ApiOkResponse({
        description: 'List of all todo lists.',
        type: dto.TodoListListResponseDto,
    })
    getAllLists(): dto.TodoListListResponseDto {
        this.logger.log('Getting all todo lists');
        const todoLists = this.todoStore.getAllLists();
        const result = {
            items: todoLists,
            count: todoLists.length,
        };
        return result;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a todo list by ID' })
    @ApiParam({ name: 'id', description: 'Todo list ID' })
    @ApiOkResponse({
        description: 'Todo list found.',
        type: dto.TodoListResponseDto,
    })
    @ApiNotFoundResponse({ description: 'Todo list not found.' })
    getListById(@Param('id', TodoListByIdPipe) todoList: TodoList.Entity): dto.TodoListResponseDto {
        return todoList;
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a todo list' })
    @ApiParam({ name: 'id', description: 'Todo list ID' })
    @ApiOkResponse({
        description: 'Todo list updated successfully.',
        type: dto.TodoListResponseDto,
    })
    @ApiNotFoundResponse({ description: 'Todo list not found.' })
    updateList(
        @Param('id', TodoListByIdPipe) todoList: TodoList.Entity,
        @Body() updateDto: dto.UpdateTodoListDto,
    ): dto.TodoListResponseDto {
        this.logger.log(`Updating todo list: ${todoList._id}`);
        const result = this.todoStore.updateList(todoList._id, updateDto);
        if (!result) {
            throw new NotFoundException(`Todo list with ID ${todoList._id} not found`);
        }
        return result;
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a todo list' })
    @ApiParam({ name: 'id', description: 'Todo list ID' })
    @ApiOkResponse({ description: 'Todo list deleted successfully.' })
    @ApiNotFoundResponse({ description: 'Todo list not found.' })
    deleteList(@Param('id', TodoListByIdPipe) todoList: TodoList.Entity): void {
        this.logger.log(`Deleting todo list: ${todoList._id}`);
        this.todoListService.deleteList(todoList._id);
    }
}

