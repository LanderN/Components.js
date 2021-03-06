import {UnnamedComponentFactory} from "./UnnamedComponentFactory";
import {Resource} from "../rdf/Resource";
import _ = require('lodash');
import {Loader} from "../Loader";
import Util = require("../Util");

/**
 * Factory for component definitions with semantic arguments and without constructor mappings.
 */
export class UnmappedNamedComponentFactory extends UnnamedComponentFactory {

    constructor(moduleDefinition: Resource, componentDefinition: Resource, config: any, constructable: boolean,
                overrideRequireNames?: {[id: string]: string}, componentRunner?: Loader) {
        super(UnmappedNamedComponentFactory.makeUnnamedDefinitionConstructor(moduleDefinition, componentDefinition)(config), constructable, overrideRequireNames, componentRunner);
    }

    /**
     * Create an unnamed component definition resource constructor.
     * The component definition's parameters will be delegated to the component constructor.
     * @param moduleDefinition The module definition with parameter definitions.
     * @param componentDefinition The component definition with parameter instances.
     * @returns {(params:any)=>Resource} A function that takes a parameter object for mapping parameter names to values
     *                                   like { 'http://example.org/param0': Resource.newString('abc') }
     *                                   and returns an unnamed component definition resource.
     */
    static makeUnnamedDefinitionConstructor(moduleDefinition: any, componentDefinition: any): ((params: any) => Resource) {
        return ((params: any) => {
            return new Resource(componentDefinition.value, {
                requireName: moduleDefinition.requireName || componentDefinition.requireName,
                requireElement: componentDefinition.requireElement,
                arguments: new Resource(null, {
                    list: [
                        new Resource("_:param_0", {
                            fields: (componentDefinition.hasParameter || []).map((parameterUri: any) => {
                                return {
                                    k: _.assignIn(parameterUri, { termType: 'Literal' }),
                                    v: Util.applyParameterValues(<Resource>componentDefinition, parameterUri, params)
                                };
                            })
                        })
                    ]
                })
            })
        });
    }

}