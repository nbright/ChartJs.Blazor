/* Set up all the chartjs interop stuff */

/// <reference path="types/Chart.min.d.ts" />   

interface ChartConfiguration extends Chart.ChartConfiguration {
    canvasId: string;
}

interface DotNetType {
    invokeMethodAsync(assemblyName, methodName, sender, args): Promise<any>;
}

interface DotNetObjectReference {
    invokeMethodAsync(methodName, sender, args): Promise<any>;
}

declare var DotNet: DotNetType;

class ChartJsInterop {

    BlazorCharts = new Map<string, Chart>();

    public SetupChart(config: ChartConfiguration): boolean {
        if (!this.BlazorCharts.has(config.canvasId)) {
            if (!config.options.legend)
                config.options.legend = {};
            let thisChart = this.initializeChartjsChart(config);
            this.BlazorCharts.set(config.canvasId, thisChart);
            return true;
        } else {
            return this.UpdateChart(config);
        }
    }

    public UpdateChart(config: ChartConfiguration): boolean {
        if (!this.BlazorCharts.has(config.canvasId))
            throw `Could not find a chart with the given id. ${config.canvasId}`;

        let myChart = this.BlazorCharts.get(config.canvasId);

        /// Handle datasets
        this.HandleDatasets(myChart, config);

        /// Handle labels
        this.MergeLabels(myChart, config);

        // Handle options - mutating the Options seems better because the rest of the computed options members are preserved
        Object.entries(config.options).forEach(e => {
            myChart.config.options[e[0]] = e[1];
        });

        myChart.update();
        return true;
    }

    private HandleDatasets(myChart: Chart, config: ChartConfiguration) {
        // Remove any datasets the aren't in the new config
        let dataSetsToRemove = myChart.config.data.datasets.filter(d => config.data.datasets.find(newD => newD.id === d.id) === undefined);
        for (const d of dataSetsToRemove) {
            const indexToRemoveAt = myChart.config.data.datasets.indexOf(d);
            if (indexToRemoveAt != -1) {
                myChart.config.data.datasets.splice(indexToRemoveAt, 1);
            }
        }
        // Add new datasets
        let dataSetsToAdd = config.data.datasets.filter(newD => myChart.config.data.datasets.find(d => newD.id === d.id) === undefined);
        dataSetsToAdd.forEach(d => myChart.config.data.datasets.push(d));
        // Update any existing datasets
        let datasetsToUpdate = myChart.config.data.datasets
            .filter(d => config.data.datasets.find(newD => newD.id === d.id) !== undefined)
            .map(d => ({oldD: d, newD: config.data.datasets.find(val => val.id === d.id)}));
        datasetsToUpdate.forEach(pair => {
            // pair.oldD.data.slice(0, pair.oldD.data.length);
            // pair.newD.data.forEach(newEntry => pair.oldD.data.push(newEntry));
            Object.entries(pair.newD).forEach(entry => pair.oldD[entry[0]] = entry[1]);
        });
    }

    private MergeLabels(myChart: Chart, config: ChartConfiguration) {
        if (config.data.labels === undefined || config.data.labels.length === 0) {
            myChart.config.data.labels = new Array<string | string[]>();
            return;
        }
        if (!myChart.config.data.labels) {
            myChart.config.data.labels = new Array<string | string[]>();
        }
        // clear existing labels
        myChart.config.data.labels.splice(0, myChart.config.data.labels.length);
        // add all the new labels
        config.data.labels.forEach(l => myChart.config.data.labels.push(l));
    }

    private initializeChartjsChart(config: ChartConfiguration): Chart {
        let ctx = <HTMLCanvasElement>document.getElementById(config.canvasId);

        // replace the Legend's OnHover function name with the actual function (if present)
        this.WireUpOnHover(config);

        // replace the Options' OnClick function name with the actual function (if present)
        this.WireUpOptionsOnClickFunc(config);

        // replace the Legend's OnClick function name with the actual function (if present)
        this.WireUpLegendOnClick(config);

        // replace the Label's GenerateLabels function name with the actual function (if present)
        this.WireUpGenerateLabelsFunc(config);

        // replace the Label's Filter function name with the actual function (if present)
        // see details here: http://www.chartjs.org/docs/latest/configuration/legend.html#legend-label-configuration
        this.WireUpLegendItemFilterFunc(config);
        let myChart = new Chart(ctx, config);
        return myChart;
    }

    private WireUpLegendItemFilterFunc(config) {
        if (config.options.legend.labels === undefined)
            config.options.legend.labels = {};
        if (config.options.legend.labels.filter &&
            typeof config.options.legend.labels.filter === "string" &&
            config.options.legend.labels.filter.includes(".")) {
            const filtersNamespaceAndFunc = config.options.legend.labels.filter.split(".");
            const filterFunc = window[filtersNamespaceAndFunc[0]][filtersNamespaceAndFunc[1]];
            if (typeof filterFunc === "function") {
                config.options.legend.labels.filter = filterFunc;
            } else { // fallback to the default, which is null
                config.options.legend.labels.filter = null;
            }
        } else { // fallback to the default, which is null
            config.options.legend.labels.filter = null;
        }
    }

    private WireUpGenerateLabelsFunc(config) {
        let getDefaultFunc = function (type) {
            let defaults = Chart.defaults[type] || Chart.defaults.global;
            if (defaults.legend &&
                defaults.legend.labels &&
                defaults.legend.labels.generateLabels) {
                return defaults.legend.labels.generateLabels;
            }
            return Chart.defaults.global.legend.labels.generateLabels;
        };

        if (config.options.legend.labels === undefined)
            config.options.legend.labels = {};
        if (config.options.legend.labels.generateLabels &&
            typeof config.options.legend.labels.generateLabels === "string" &&
            config.options.legend.labels.generateLabels.includes(".")) {
            const generateLabelsNamespaceAndFunc = config.options.legend.labels.generateLabels.split(".");
            const generateLabelsFunc = window[generateLabelsNamespaceAndFunc[0]][generateLabelsNamespaceAndFunc[1]];
            if (typeof generateLabelsFunc === "function") {
                config.options.legend.labels.generateLabels = generateLabelsFunc;
            } else { // fallback to the default
                config.options.legend.labels.generateLabels = getDefaultFunc(config.type);
            }
        } else { // fallback to the default
            config.options.legend.labels.generateLabels = getDefaultFunc(config.type);
        }
    }

    private WireUpOptionsOnClickFunc(config: ChartConfiguration) {
        let getDefaultFunc = function (type) {
            let defaults = Chart.defaults[type] || Chart.defaults.global;
            if (defaults && defaults.onClick) {
                return defaults.onClick;
            }
            return undefined;
        };

        if (config.options.onClick) {
            // Js function
            if (typeof config.options.onClick === "object" &&
                config.options.onClick.hasOwnProperty('fullFunctionName')) {
                let onClickStringName: { fullFunctionName: string } = <any>config.options.onClick;
                const onClickNamespaceAndFunc = onClickStringName.fullFunctionName.split(".");
                const onClickFunc = window[onClickNamespaceAndFunc[0]][onClickNamespaceAndFunc[1]];
                if (typeof onClickFunc === "function") {
                    config.options.onClick = onClickFunc;
                } else { // fallback to the default
                    config.options.onClick = getDefaultFunc(config.type);
                }
            }
            // .Net static method
            else if (typeof config.options.onClick === "object" &&
                config.options.onClick.hasOwnProperty('assemblyName') &&
                config.options.onClick.hasOwnProperty('methodName')) {
                config.options.onClick = (function () {
                    const onClickStatickHandler: { assemblyName: string, methodName: string } = <any>config.options.onClick;
                    const assemblyName = onClickStatickHandler.assemblyName;
                    const methodName = onClickStatickHandler.methodName;
                    return async function (sender, args) {
                        await DotNet.invokeMethodAsync(assemblyName, methodName, sender, args);
                    };
                })();
            }
            // .Net instance method
            else if (typeof config.options.onClick === "object" &&
                config.options.onClick.hasOwnProperty('instanceRef') &&
                config.options.onClick.hasOwnProperty('methodName')) {
                config.options.onClick = (function () {
                    const onClickInstanceHandler: { instanceRef: DotNetObjectReference, methodName: string } = <any>config.options.onClick;
                    const instanceRef = onClickInstanceHandler.instanceRef;
                    const methodName = onClickInstanceHandler.methodName;
                    return async function (sender, args) {
                        await instanceRef.invokeMethodAsync(methodName,
                            sender,
                            args.map(e => Object.assign({}, e, {_chart: undefined})));
                    };
                })();
            }
        } else { // fallback to the default
            config.options.onClick = getDefaultFunc(config.type);
        }
    }

    private WireUpLegendOnClick(config) {
        let getDefaultHandler = type => {
            let defaults = Chart.defaults[type] || Chart.defaults.global;
            if (defaults.legend &&
                defaults.legend.onClick) {
                return defaults.legend.onClick;
            }
            return Chart.defaults.global.legend.onClick;
        };
        if (config.options.legend.onClick) {
            // Js function
            if (typeof config.options.legend.onClick === "object" &&
                config.options.legend.onClick.hasOwnProperty('fullFunctionName')) {
                const onClickNamespaceAndFunc = config.options.legend.onClick.fullFunctionName.split(".");
                const onClickFunc = window[onClickNamespaceAndFunc[0]][onClickNamespaceAndFunc[1]];
                if (typeof onClickFunc === "function") {
                    config.options.legend.onClick = onClickFunc;
                } else { // fallback to the default
                    config.options.legend.onClick = getDefaultHandler(config.type);
                }
            }
            // .Net static method
            else if (typeof config.options.legend.onClick === "object" &&
                config.options.legend.onClick.hasOwnProperty('assemblyName') &&
                config.options.legend.onClick.hasOwnProperty('methodName')) {
                config.options.legend.onClick = (function () {
                    const assemblyName = config.options.legend.onClick.assemblyName;
                    const methodName = config.options.legend.onClick.methodName;
                    return async function (sender, args) {
                        await DotNet.invokeMethodAsync(assemblyName, methodName, sender, args);
                    };
                })();
            }
            // .Net instance method
            else if (typeof config.options.legend.onClick === "object" &&
                config.options.legend.onClick.hasOwnProperty('instanceRef') &&
                config.options.legend.onClick.hasOwnProperty('methodName')) {
                config.options.legend.onClick = (function () {
                    const instanceRef = config.options.legend.onClick.instanceRef;
                    const methodName = config.options.legend.onClick.methodName;
                    return async function (sender, args) {
                        await instanceRef.invokeMethodAsync(methodName, sender, args);
                    };
                })();
            }
        } else { // fallback to the default
            config.options.legend.onClick = getDefaultHandler(config.type);
        }
    }

    private WireUpOnHover(config) {
        if (config.options.legend.onHover) {
            if (typeof config.options.legend.onHover === "object" &&
                config.options.legend.onHover.hasOwnProperty('fullFunctionName')) {
                const onHoverNamespaceAndFunc = config.options.legend.onHover.fullFunctionName.split(".");
                const onHoverFunc = window[onHoverNamespaceAndFunc[0]][onHoverNamespaceAndFunc[1]];
                if (typeof onHoverFunc === "function") {
                    config.options.legend.onHover = onHoverFunc;
                } else { // fallback to the default
                    config.options.legend.onHover = null;
                }
            }
            // .Net static method
            else if (typeof config.options.legend.onHover === "object" &&
                config.options.legend.onHover.hasOwnProperty('assemblyName') &&
                config.options.legend.onHover.hasOwnProperty('methodName')) {
                config.options.legend.onHover = (function () {
                    const assemblyName = config.options.legend.onHover.assemblyName;
                    const methodName = config.options.legend.onHover.methodName;
                    return async function (sender, mouseOverEvent) {
                        await DotNet.invokeMethodAsync(assemblyName, methodName, sender, mouseOverEvent);
                    };
                })();
            }
            // .Net instance method
            else if (typeof config.options.legend.onHover === "object" &&
                config.options.legend.onHover.hasOwnProperty('instanceRef') &&
                config.options.legend.onHover.hasOwnProperty('methodName')) {
                config.options.legend.onHover = (function () {
                    const instanceRef = config.options.legend.onHover.instanceRef;
                    const methodName = config.options.legend.onHover.methodName;
                    return async function (sender, mouseOverEvent) {
                        await instanceRef.invokeMethodAsync(methodName, sender, mouseOverEvent);
                    };
                })();
            }
        } else { // fallback to the default
            config.options.legend.onHover = null;
        }
    }
}