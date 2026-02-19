import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { OpenAPIV3 } from 'openapi-types'
import { useConfigStore } from '@/stores/config'

export const useOpenApiStore = defineStore('openapi', () => {
    const config = useConfigStore()
    
    // State
    const openApiSpec = ref<OpenAPIV3.Document | null>(null)
    const loading = ref(true)
    const error = ref<string | null>(null)

    // Computed
    const openApiSpecUrl = computed(() => {
        return config.openApiSpecUrl || ''
    })

    const endpoints = computed(() => {
        if (!openApiSpec.value) return []

        const result: Array<{ path: string; method: string; operation: OpenAPIV3.OperationObject }> = []

        for (const [path, pathItem] of Object.entries(openApiSpec.value.paths)) {
            if (!pathItem) continue

            for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
                const operation = pathItem[method]
                if (operation) {
                    result.push({ path, method: method.toUpperCase(), operation })
                }
            }
        }

        return result.sort((a, b) => {
            if (a.path !== b.path) return a.path.localeCompare(b.path)
            return a.method.localeCompare(b.method)
        })
    })

    const securitySchemes = computed(() => {
        if (!openApiSpec.value?.components?.securitySchemes) {
            return []
        }

        const schemes: Array<{
            name: string
            scheme: OpenAPIV3.SecuritySchemeObject
        }> = []

        for (const [name, scheme] of Object.entries(openApiSpec.value.components.securitySchemes)) {
            if (scheme && typeof scheme === 'object' && !('$ref' in scheme)) {
                schemes.push({ name, scheme })
            }
        }

        return schemes
    })

    const openApiTitle = computed(() => {
        return openApiSpec.value?.info?.title || 'OpenAPI Studio'
    })

    const openApiDescription = computed(() => {
        return openApiSpec.value?.info?.description || null
    })

    const openApiVersion = computed(() => {
        return openApiSpec.value?.info?.version || null
    })

    // Actions
    async function loadSpec(url?: string) {
        loading.value = true
        error.value = null


        console.log('loadSpec', url, openApiSpecUrl.value)
        try {
            const specUrl = url || openApiSpecUrl.value
            const response = await fetch(specUrl)
            if (!response.ok) {
                throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`)
            }
            openApiSpec.value = await response.json()
        } catch (err) {
            console.log(err)
            error.value = err instanceof Error ? err.message : 'Failed to load OpenAPI spec'
        } finally {
            loading.value = false
        }
    }

    // Utility functions
    function resolveReference<T = any>(ref: string | { $ref: string }, spec: OpenAPIV3.Document): T | null {
        const refPath = (typeof ref === 'string' ? ref : ref.$ref).replace('#/', '').split('/')
        let refValue: any = spec
        for (const part of refPath) {
            if (refValue && typeof refValue === 'object' && part in refValue) {
                refValue = refValue[part]
            } else {
                return null
            }
        }
        return refValue as T | null
    }

    function resolveParameter(param: OpenAPIV3.ParameterObject | OpenAPIV3.ReferenceObject): OpenAPIV3.ParameterObject | null {
        if (!param || typeof param !== 'object') return null

        // If it's a reference, resolve it
        if ('$ref' in param && param.$ref) {
            if (!openApiSpec.value) return null
            const resolved = resolveReference<OpenAPIV3.ParameterObject>(param.$ref, openApiSpec.value)
            if (resolved && typeof resolved === 'object' && 'name' in resolved && 'in' in resolved) {
                return resolved
            }
            return null
        }

        // If it's already a parameter object
        if ('name' in param && 'in' in param) {
            return param as OpenAPIV3.ParameterObject
        }

        return null
    }

    function generateExampleFromSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined, spec: OpenAPIV3.Document): any {
        if (!schema || typeof schema !== 'object') return null

        // Handle references
        if ('$ref' in schema && schema.$ref) {
            const refValue = resolveReference<OpenAPIV3.SchemaObject>(schema.$ref, spec)
            if (!refValue || typeof refValue !== 'object') return null
            return generateExampleFromSchema(refValue, spec)
        }

        // Handle examples if present
        if ('example' in schema && schema.example !== undefined) {
            return schema.example
        }

        // Handle enum
        if ('enum' in schema && schema.enum && schema.enum.length > 0) {
            return schema.enum[0]
        }

        // Handle different types - schema is guaranteed to be SchemaObject here (not ReferenceObject)
        const schemaObj = schema as OpenAPIV3.SchemaObject
        const type = schemaObj.type || (schemaObj.anyOf ? 'anyOf' : schemaObj.oneOf ? 'oneOf' : schemaObj.allOf ? 'allOf' : 'object')

        switch (type) {
            case 'string':
                if ('format' in schemaObj) {
                    switch (schemaObj.format) {
                        case 'date':
                            return '2024-01-01'
                        case 'date-time':
                            return '2024-01-01T00:00:00Z'
                        case 'email':
                            return 'example@example.com'
                        case 'uri':
                            return 'https://example.com'
                        case 'uuid':
                            return '123e4567-e89b-12d3-a456-426614174000'
                    }
                }
                return ('default' in schemaObj && schemaObj.default !== undefined) ? schemaObj.default : 'string'

            case 'number':
            case 'integer':
                return ('default' in schemaObj && schemaObj.default !== undefined) ? schemaObj.default : (type === 'integer' ? 0 : 0.0)

            case 'boolean':
                return ('default' in schemaObj && schemaObj.default !== undefined) ? schemaObj.default : false

            case 'array':
                if ('items' in schema && schema.items) {
                    const itemExample = generateExampleFromSchema(schema.items, spec)
                    return schema.minItems && schema.minItems > 0
                        ? Array(schema.minItems).fill(itemExample)
                        : [itemExample]
                }
                return []

            case 'object':
                const obj: Record<string, any> = {}
                if ('properties' in schema && schema.properties) {
                    for (const [key, propSchema] of Object.entries(schema.properties)) {
                        if ('required' in schema && schema.required && schema.required.includes(key)) {
                            obj[key] = generateExampleFromSchema(propSchema, spec)
                        } else if (!('required' in schema)) {
                            // If no required array, include all properties
                            obj[key] = generateExampleFromSchema(propSchema, spec)
                        }
                    }
                }
                return obj

            case 'anyOf':
                if ('anyOf' in schema && schema.anyOf && schema.anyOf.length > 0) {
                    return generateExampleFromSchema(schema.anyOf[0], spec)
                }
                return {}

            case 'oneOf':
                if ('oneOf' in schema && schema.oneOf && schema.oneOf.length > 0) {
                    return generateExampleFromSchema(schema.oneOf[0], spec)
                }
                return {}

            case 'allOf':
                if ('allOf' in schema && schema.allOf) {
                    const merged: Record<string, any> = {}
                    for (const subSchema of schema.allOf) {
                        const example = generateExampleFromSchema(subSchema, spec)
                        if (typeof example === 'object' && example !== null && !Array.isArray(example)) {
                            Object.assign(merged, example)
                        }
                    }
                    return merged
                }
                return {}

            default:
                return null
        }
    }

    function formatSchemaForDisplay(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined, spec: OpenAPIV3.Document, visited = new Set<string>(), level = 0, propertyName?: string): string {
        if (!schema || typeof schema !== 'object') return ''

        const indent = '  '.repeat(level)
        let output = ''

        // Handle references
        if ('$ref' in schema && schema.$ref) {
            // Prevent circular references
            if (visited.has(schema.$ref)) {
                return `${indent}${propertyName || ''} → ${schema.$ref.split('/').pop()} ⚠ circular\n`
            }
            visited.add(schema.$ref)

            const refValue = resolveReference<OpenAPIV3.SchemaObject>(schema.$ref, spec)
            if (!refValue || typeof refValue !== 'object') {
                visited.delete(schema.$ref)
                return `${indent}${propertyName || ''} → ${schema.$ref.split('/').pop()} (invalid)\n`
            }

            // Get the schema name from the reference
            const refName = schema.$ref.split('/').pop() || 'Unknown'
            if (propertyName !== undefined) {
                const isRequired = false // We don't have required info here
                output += `${indent}${propertyName}${isRequired ? '*' : ''} → ${refName}\n`
                // Show the referenced schema content
                output += formatSchemaForDisplay(refValue, spec, visited, level, undefined)
            } else {
                output += `${indent}→ ${refName}\n`
                output += formatSchemaForDisplay(refValue, spec, visited, level, undefined)
            }
            visited.delete(schema.$ref)
            return output
        }

        // Get type information
        const getTypeString = (s: any): string => {
            if (s.type === 'array' && s.items) {
                const itemType = getTypeString(s.items)
                return `Array<${itemType}>`
            }
            if (s.type) {
                let typeStr = s.type
                if (s.format) {
                    typeStr = `${s.type}(${s.format})`
                }
                if (s.enum) {
                    typeStr = `${typeStr} | ${s.enum.map((e: any) => JSON.stringify(e)).join(' | ')}`
                }
                return typeStr
            }
            if (s.allOf) return 'allOf'
            if (s.anyOf) return 'anyOf'
            if (s.oneOf) return 'oneOf'
            return 'object'
        }

        const typeStr = getTypeString(schema)
        const isRequired = propertyName && 'required' in schema && schema.required && Array.isArray(schema.required) && schema.required.includes(propertyName)

        // Format property line
        if (propertyName !== undefined) {
            output += `${indent}${propertyName}${isRequired ? '*' : ''}: ${typeStr}`
            if ('description' in schema && schema.description) {
                output += `  // ${schema.description}`
            }
            output += '\n'
        } else if (level === 0 && 'properties' in schema) {
            // Root level - show as object
            output += `${indent}{\n`
        }

        // Properties
        if ('properties' in schema && schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                output += formatSchemaForDisplay(propSchema as any, spec, visited, level + 1, key)
            }
            if (level === 0 && 'type' in schema && schema.type === 'object') {
                output += `${indent}}\n`
            }
        }

        // Items (for arrays)
        if ('items' in schema && schema.items && 'type' in schema && schema.type === 'array') {
            if ('properties' in schema.items || '$ref' in schema.items) {
                output += `${indent}  items:\n`
                output += formatSchemaForDisplay(schema.items, spec, visited, level + 2)
            }
        }

        // allOf, anyOf, oneOf
        if ('allOf' in schema && schema.allOf) {
            schema.allOf.forEach((s: any, i: number) => {
                output += `${indent}  allOf[${i}]:\n`
                output += formatSchemaForDisplay(s, spec, visited, level + 2)
            })
        }

        if ('anyOf' in schema && schema.anyOf) {
            schema.anyOf.forEach((s: any, i: number) => {
                output += `${indent}  anyOf[${i}]:\n`
                output += formatSchemaForDisplay(s, spec, visited, level + 2)
            })
        }

        if ('oneOf' in schema && schema.oneOf) {
            schema.oneOf.forEach((s: any, i: number) => {
                output += `${indent}  oneOf[${i}]:\n`
                output += formatSchemaForDisplay(s, spec, visited, level + 2)
            })
        }

        // Additional constraints
        if (propertyName) {
            const constraints: string[] = []
            if ('pattern' in schema && schema.pattern) constraints.push(`pattern: ${schema.pattern}`)
            if ('default' in schema && schema.default !== undefined) constraints.push(`default: ${JSON.stringify(schema.default)}`)
            if ('minLength' in schema && schema.minLength !== undefined) constraints.push(`minLength: ${schema.minLength}`)
            if ('maxLength' in schema && schema.maxLength !== undefined) constraints.push(`maxLength: ${schema.maxLength}`)
            if ('minimum' in schema && schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`)
            if ('maximum' in schema && schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`)
            if (constraints.length > 0) {
                output += `${indent}    (${constraints.join(', ')})\n`
            }
        }

        return output
    }

    function collectSchemaReferences(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined, spec: OpenAPIV3.Document, refs: Map<string, { name: string; schema: OpenAPIV3.SchemaObject }>, visited = new Set<string>()): void {
        if (!schema || typeof schema !== 'object') return

        // Handle references
        if ('$ref' in schema && schema.$ref) {
            // Prevent circular references
            if (visited.has(schema.$ref)) {
                return
            }
            visited.add(schema.$ref)

            const refValue = resolveReference<OpenAPIV3.SchemaObject>(schema.$ref, spec)
            if (!refValue || typeof refValue !== 'object') {
                visited.delete(schema.$ref)
                return
            }

            const refName = schema.$ref.split('/').pop() || 'Unknown'
            if (!refs.has(schema.$ref)) {
                refs.set(schema.$ref, { name: refName, schema: refValue })
            }

            // Recursively collect references from the referenced schema
            collectSchemaReferences(refValue, spec, refs, visited)
            visited.delete(schema.$ref)
            return
        }

        // Recursively check properties
        if ('properties' in schema && schema.properties) {
            for (const propSchema of Object.values(schema.properties)) {
                collectSchemaReferences(propSchema, spec, refs, visited)
            }
        }

        // Check items for arrays
        if ('items' in schema && schema.items) {
            collectSchemaReferences(schema.items, spec, refs, visited)
        }

        // Check allOf, anyOf, oneOf
        if ('allOf' in schema && schema.allOf) {
            schema.allOf.forEach(s => collectSchemaReferences(s, spec, refs, visited))
        }
        if ('anyOf' in schema && schema.anyOf) {
            schema.anyOf.forEach(s => collectSchemaReferences(s, spec, refs, visited))
        }
        if ('oneOf' in schema && schema.oneOf) {
            schema.oneOf.forEach(s => collectSchemaReferences(s, spec, refs, visited))
        }
    }

    // Helper methods that work with the spec
    function getSelectedEndpoint(path: string | null, method: string | null): OpenAPIV3.OperationObject | null {
        if (!openApiSpec.value || !path || !method) {
            return null
        }
        const pathItem = openApiSpec.value.paths[path]
        if (!pathItem) return null
        const methodKey = method.toLowerCase() as keyof typeof pathItem
        return (pathItem[methodKey] as OpenAPIV3.OperationObject) || null
    }

    function getRequestBodySchema(operation: OpenAPIV3.OperationObject | null): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | null {
        if (!operation || !openApiSpec.value) return null

        let requestBody: OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject | undefined = operation.requestBody
        if (!requestBody || typeof requestBody !== 'object') return null

        // Handle reference
        if ('$ref' in requestBody && requestBody.$ref) {
            const refValue = resolveReference<OpenAPIV3.RequestBodyObject>(requestBody.$ref, openApiSpec.value)
            if (!refValue || typeof refValue !== 'object') return null
            requestBody = refValue
        }

        // Get content
        if (!requestBody || !('content' in requestBody) || !requestBody.content) return null

        // Try to get JSON schema
        const jsonContent = requestBody.content['application/json']
        if (!jsonContent || !jsonContent.schema) return null

        return jsonContent.schema
    }

    function getExampleFromRequestBody(operation: OpenAPIV3.OperationObject | null): any {
        if (!operation || !openApiSpec.value) return null

        const schema = getRequestBodySchema(operation)
        if (!schema) return null

        return generateExampleFromSchema(schema, openApiSpec.value)
    }

    function getExampleFromResponse(operation: OpenAPIV3.OperationObject | null, preferSuccess = true): any {
        if (!operation || !openApiSpec.value) return null

        const responses = operation.responses
        if (!responses || typeof responses !== 'object') return null

        // Try to get a successful response (200, 201, etc.)
        const successCodes = ['200', '201', '202', '204']
        let response: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject | undefined

        if (preferSuccess) {
            for (const code of successCodes) {
                if (responses && code in responses) {
                    response = responses[code]
                    break
                }
            }
        }

        // If no success code, get the first response
        if (!response && responses) {
            const firstKey = Object.keys(responses)[0]
            if (firstKey) {
                response = responses[firstKey]
            }
        }

        if (!response || typeof response !== 'object') return null

        // Handle reference
        if ('$ref' in response && response.$ref) {
            const refValue = resolveReference<OpenAPIV3.ResponseObject>(response.$ref, openApiSpec.value)
            if (!refValue || typeof refValue !== 'object') return null
            response = refValue
        }

        // Get content
        if (!response || typeof response !== 'object' || !('content' in response) || !response.content) return null

        // Try to get JSON schema
        const jsonContent = response.content['application/json']
        if (!jsonContent || !jsonContent.schema) return null

        return generateExampleFromSchema(jsonContent.schema, openApiSpec.value)
    }

    function getAllResponseExamples(operation: OpenAPIV3.OperationObject | null): Array<{
        code: string
        description: string
        example: any
        schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
        isSuccess: boolean
    }> {
        if (!operation || !openApiSpec.value) return []

        const responses = operation.responses
        if (!responses || typeof responses !== 'object') return []

        const result: Array<{
            code: string
            description: string
            example: any
            schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
            isSuccess: boolean
        }> = []

        for (const [code, response] of Object.entries(responses)) {
            let responseObj: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject | undefined = response

            // Handle reference
            if (responseObj && typeof responseObj === 'object' && '$ref' in responseObj && responseObj.$ref) {
                const refValue = resolveReference<OpenAPIV3.ResponseObject>(responseObj.$ref, openApiSpec.value)
                if (!refValue || typeof refValue !== 'object') continue
                responseObj = refValue
            }

            if (!responseObj || typeof responseObj !== 'object') continue

            const description = 'description' in responseObj ? responseObj.description || 'No description' : 'No description'

            // Get example and schema from content
            let example: any = null
            let schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined = undefined
            if ('content' in responseObj && responseObj.content) {
                const jsonContent = responseObj.content['application/json']
                if (jsonContent && jsonContent.schema) {
                    schema = jsonContent.schema
                    example = generateExampleFromSchema(jsonContent.schema, openApiSpec.value)
                }
            }

            const statusCode = parseInt(code)
            const isSuccess = !isNaN(statusCode) && statusCode >= 200 && statusCode < 300

            result.push({
                code,
                description,
                example,
                schema,
                isSuccess,
            })
        }

        // Sort: success codes first, then by code
        return result.sort((a, b) => {
            if (a.isSuccess !== b.isSuccess) {
                return a.isSuccess ? -1 : 1
            }
            const aCode = parseInt(a.code)
            const bCode = parseInt(b.code)
            if (!isNaN(aCode) && !isNaN(bCode)) {
                return aCode - bCode
            }
            return a.code.localeCompare(b.code)
        })
    }

    function getEndpointSchemaReferences(operation: OpenAPIV3.OperationObject | null): Array<{ name: string; schema: OpenAPIV3.SchemaObject }> {
        if (!operation || !openApiSpec.value) return []

        const refs = new Map<string, { name: string; schema: OpenAPIV3.SchemaObject }>()

        // Collect from request body
        const requestBodySchema = getRequestBodySchema(operation)
        if (requestBodySchema) {
            collectSchemaReferences(requestBodySchema, openApiSpec.value, refs)
        }

        // Collect from responses
        if (operation.responses) {
            for (const response of Object.values(operation.responses)) {
                let responseObj: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject | undefined = response

                // Handle reference
                if (responseObj && typeof responseObj === 'object' && '$ref' in responseObj && responseObj.$ref) {
                    const refValue = resolveReference<OpenAPIV3.ResponseObject>(responseObj.$ref, openApiSpec.value)
                    if (refValue && typeof refValue === 'object') {
                        responseObj = refValue
                    }
                }

                if (responseObj && typeof responseObj === 'object' && 'content' in responseObj && responseObj.content) {
                    const jsonContent = responseObj.content['application/json']
                    if (jsonContent && jsonContent.schema) {
                        collectSchemaReferences(jsonContent.schema, openApiSpec.value, refs)
                    }
                }
            }
        }

        // Collect from parameters
        if (operation.parameters) {
            for (const param of operation.parameters) {
                const resolved = resolveParameter(param)
                if (resolved && resolved.schema) {
                    collectSchemaReferences(resolved.schema, openApiSpec.value, refs)
                }
            }
        }

        // Convert to array and sort by name
        return Array.from(refs.values()).sort((a, b) => a.name.localeCompare(b.name))
    }

    function endpointRequiresSecurity(operation: OpenAPIV3.OperationObject): boolean {
        if (!openApiSpec.value) return false

        // Check if endpoint has specific security requirements
        if (operation.security && operation.security.length > 0) {
            return true
        }

        // Check global security
        if (openApiSpec.value.security && openApiSpec.value.security.length > 0) {
            return true
        }

        return false
    }

    function getRequiredSecuritySchemes(operation: OpenAPIV3.OperationObject): Array<{ name: string; scheme: OpenAPIV3.SecuritySchemeObject }> {
        if (!openApiSpec.value?.components?.securitySchemes) {
            return []
        }

        const schemeNames = new Set<string>()
        const required: Array<{ name: string; scheme: OpenAPIV3.SecuritySchemeObject }> = []

        // Check if endpoint has specific security requirements
        if (operation.security && operation.security.length > 0) {
            // Iterate through all security requirements (OR options)
            for (const securityRequirement of operation.security) {
                // Each requirement can have multiple schemes (AND logic)
                for (const schemeName in securityRequirement) {
                    if (!schemeNames.has(schemeName)) {
                        schemeNames.add(schemeName)
                        const scheme = securitySchemes.value.find(s => s.name === schemeName)
                        if (scheme) {
                            required.push(scheme)
                        }
                    }
                }
            }
        } else if (openApiSpec.value.security && openApiSpec.value.security.length > 0) {
            // Check global security - iterate through all security requirements
            for (const securityRequirement of openApiSpec.value.security) {
                for (const schemeName in securityRequirement) {
                    if (!schemeNames.has(schemeName)) {
                        schemeNames.add(schemeName)
                        const scheme = securitySchemes.value.find(s => s.name === schemeName)
                        if (scheme) {
                            required.push(scheme)
                        }
                    }
                }
            }
        }

        return required
    }

    function getAvailableSecuritySchemes(operation: OpenAPIV3.OperationObject | null): Array<{ name: string; scheme: OpenAPIV3.SecuritySchemeObject }> {
        if (!operation || !openApiSpec.value?.components?.securitySchemes) {
            return []
        }

        const schemeNames = new Set<string>()
        const available: typeof securitySchemes.value = []

        // Check if endpoint has specific security requirements
        if (operation.security && operation.security.length > 0) {
            // Iterate through all security requirements (OR options)
            for (const securityRequirement of operation.security) {
                // Each requirement can have multiple schemes (AND logic)
                for (const schemeName in securityRequirement) {
                    if (!schemeNames.has(schemeName)) {
                        schemeNames.add(schemeName)
                        const scheme = securitySchemes.value.find(s => s.name === schemeName)
                        if (scheme) {
                            available.push(scheme)
                        }
                    }
                }
            }

            return available
        }

        // Check global security (only if endpoint doesn't override)
        if (openApiSpec.value.security && openApiSpec.value.security.length > 0) {
            // Iterate through all global security requirements
            for (const securityRequirement of openApiSpec.value.security) {
                for (const schemeName in securityRequirement) {
                    if (!schemeNames.has(schemeName)) {
                        schemeNames.add(schemeName)
                        const scheme = securitySchemes.value.find(s => s.name === schemeName)
                        if (scheme) {
                            available.push(scheme)
                        }
                    }
                }
            }
        }

        return available
    }

    return {
        // State
        openApiSpec,
        loading,
        error,
        // Computed
        openApiSpecUrl,
        endpoints,
        securitySchemes,
        openApiTitle,
        openApiDescription,
        openApiVersion,
        // Actions
        loadSpec,
        // Utility functions
        resolveReference,
        resolveParameter,
        generateExampleFromSchema,
        formatSchemaForDisplay,
        // Helper methods
        getSelectedEndpoint,
        getRequestBodySchema,
        getExampleFromRequestBody,
        getExampleFromResponse,
        getAllResponseExamples,
        getEndpointSchemaReferences,
        endpointRequiresSecurity,
        getRequiredSecuritySchemes,
        getAvailableSecuritySchemes,
    }
})
