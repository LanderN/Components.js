import {UnnamedComponentFactory} from "./UnnamedComponentFactory";
import {Resource} from "../rdf/Resource";
import _ = require('lodash');
import {Loader} from "../Loader";
import Util = require("../Util");
import NodeUtil = require('util');

/**
 * Factory for component definitions with semantic arguments and with constructor mappings.
 */
export class MappedNamedComponentFactory extends UnnamedComponentFactory {

    constructor(moduleDefinition: Resource, componentDefinition: Resource, config: any, constructable: boolean,
                overrideRequireNames?: {[id: string]: string}, componentRunner?: Loader) {
        // TODO: check if constructorArgumentss param references are defined in hasParameters
        super(MappedNamedComponentFactory.makeUnnamedDefinitionConstructor(moduleDefinition, componentDefinition)(config), constructable, overrideRequireNames, componentRunner);
    }

    static mapValue(resourceScope: Resource, v: any, params: any, rawValue?: boolean): any {
        let value: any;
        if (v.termType === 'NamedNode' && v.value === Util.PREFIXES['rdf'] + 'subject') {
            value = Resource.newString(params.value);
        }
        else if (v.termType === 'NamedNode') {
            value = Util.applyParameterValues(resourceScope, v, params);
        } else {
            value = MappedNamedComponentFactory.map(resourceScope, v, params);
        }
        if (rawValue) {
            value = Resource.newString(value.value);
        }
        return value;
    }

    /**
     * Map a resource object.
     * Only the values of object-resources will be mapped to its parameter value.
     * For example, the resource { k: Resource.newString('param0'), v: new Resource('http://example.org/param0') }
     * with params { 'http://example.org/param0': Resource.newString('abc') }
     * will be mapped to { k: Resource.newString('param0'), v: Resource.newString('abc') }.
     * @param resourceScope The resource scope to map in.
     * @param resource The resource to map.
     * @param params The parameters object.
     * @returns {any} The mapped resource.
     */
    static map(resourceScope: Resource, resource: any, params: any): any {
        if (resource.v || resource.vRaw) {
            if (resource.k && resource.k.termType === 'Literal' && !resource.collectEntriesFrom) {
                return { k: resource.k, v: MappedNamedComponentFactory.mapValue(resourceScope, resource.v || resource.vRaw, params, resource.vRaw) };
            } else if (!resource.k && !resource.collectEntriesFrom) {
                return MappedNamedComponentFactory.mapValue(resourceScope, resource.v || resource.vRaw, params, resource.vRaw);
            } else {
                if (!resource.collectEntriesFrom) {
                    throw new Error('If an object key is a URI, it must provide dynamic entries using the oo:collectEntriesFrom predicate: ' + resource);
                }
                return resource.collectEntriesFrom.reduce((data: Resource[], entry: Resource) => {
                    if (entry.termType !== 'NamedNode') {
                        throw new Error('Dynamic entry identifiers must be URI\'s: ' + entry);
                    }
                    let values: any = Util.applyParameterValues(resourceScope, entry, params);
                    if (values) {
                        values.forEach((value: any) => data.push(value));
                    }
                    return data;
                }, [])
                    .map((entryResource: any) => {
                        let k: any;
                        let v: any;
                        if (resource.k) {
                            if (resource.k.termType === 'NamedNode' && resource.k.value === Util.PREFIXES['rdf'] + 'subject') {
                                k = Resource.newString(entryResource.value);
                            }
                            else if (!entryResource[resource.k.value] || entryResource[resource.k.value].length !== 1) {
                                throw new Error('Expected exactly one label definition for a dynamic entry '
                                    + resource.k.value + ' in ' + entryResource.value + '\nFound:' + entryResource.toString());
                            }
                            else {
                                k = entryResource[resource.k.value][0];
                            }
                        }

                        if (resource.v.termType === 'NamedNode' && resource.v.value === Util.PREFIXES['rdf'] + 'subject') {
                            v = Resource.newString(entryResource.value);
                        }
                        else if (resource.v.termType === 'NamedNode' && resource.v.value === Util.PREFIXES['rdf'] + 'object') {
                            v = MappedNamedComponentFactory.map(resourceScope, entryResource, params);
                        }
                        else {
                            if (resource.v && (resource.v.fields || resource.v.elements)) {
                                // Nested mapping should reduce the parameter scope
                                v = MappedNamedComponentFactory.mapValue(resourceScope, resource.v, entryResource);
                            }
                            else if (!entryResource[resource.v.value] || entryResource[resource.v.value].length !== 1) {
                                throw new Error('Expected exactly one value definition for a dynamic entry '
                                    + resource.k.value + ' in ' + entryResource.value + '\nFound: ' + entryResource.toString());
                            }
                            else {
                                v = entryResource[resource.v.value][0];
                            }
                        }
                        return resource.k ? { k: k, v: v } : v;
                    });
            }
        }
        else if (resource.fields) {
            return new Resource(null, {
                fields: resource.fields.reduce((fields: any[], field: any) => {
                    let mapped: any = MappedNamedComponentFactory.map(resourceScope, field, params);
                    if (mapped instanceof Array) {
                        fields = fields.concat(mapped);
                    } else {
                        fields.push(mapped);
                    }
                    return fields;
                }, [])
            });
        }
        else if (resource.elements) {
            if (!resource.elements.list) {
                throw new Error('Parameter array elements musts be lists, but found: ' + NodeUtil.inspect(resource.elements));
            }
            return new Resource(null, {
                elements: resource.elements.list.reduce((elements: any[], element: any) => {
                    if (element.termType !== 'NamedNode' && !element.v && !element.vRaw) {
                        throw new Error('Parameter array elements must be URI\'s, but found: ' + NodeUtil.inspect(element));
                    }
                    let mapped: any = { v: MappedNamedComponentFactory.mapValue(resourceScope, element, params, element.vRaw) };
                    elements.push(mapped);
                    return elements;
                }, [])
            });
        }
        else if (resource.list) {
            return new Resource(null, {
                list: resource.list.map(
                    (argument: any) => (argument.fields || argument.elements)
                        ? MappedNamedComponentFactory.map(resourceScope, argument, params)
                        : MappedNamedComponentFactory.mapValue(resourceScope, argument, params)
                )
            });
        }
        return resource;
    }

    /**
     * Create an unnamed component definition resource constructor.
     * The component definition's parameters will first be mapped, and then delegated to the component constructor.
     * @param moduleDefinition The module definition with parameter definitions.
     * @param componentDefinition The component definition with parameter instances.
     * @returns {(params:any)=>Resource} A function that takes a parameter object for mapping parameter names to values
     *                                   like { 'http://example.org/param0': Resource.newString('abc') }
     *                                   and returns an unnamed component definition resource.
     */
    static makeUnnamedDefinitionConstructor(moduleDefinition: any, componentDefinition: any): ((params: any) => Resource) {
        // TODO: validate param types
        return ((params: any) => {
            return new Resource(params.value, {
                requireName: moduleDefinition.requireName || componentDefinition.requireName,
                requireElement: componentDefinition.requireElement,
                arguments: componentDefinition.constructorArguments ? MappedNamedComponentFactory.map(<Resource>params, _.cloneDeep(componentDefinition.constructorArguments), params) : null
            })
        });
    }

}