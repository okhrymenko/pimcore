/**
 * Pimcore
 *
 * This source file is available under two different licenses:
 * - GNU General Public License version 3 (GPLv3)
 * - Pimcore Enterprise License (PEL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 * @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 * @license    http://www.pimcore.org/license     GPLv3 and PEL
 */

pimcore.registerNS("pimcore.asset.metadata.grid");
pimcore.asset.metadata.grid = Class.create({

    initialize: function (config) {
        this.config = config;
        this.asset = config.asset;

        /** @type {pimcore.asset.metadata.dataProvider} */
        this.dataProvider = config.dataProvider;
    },

    getLayout: function () {

        this.dataProvider.setStore(this.asset.data.metadata);

        let updateListener = function(eventType, name, language, newValue, type, originator) {
            if (originator == this.grid.getId()) {
                // nothing to do
                return;
            }
            let store = this.grid.getStore();
            language = language || "";
            var existingIndex = store.findBy(function (record, id) {
                if (record.data.name == name && record.data.language == language) {
                    return true;
                }
                return false;
            }.bind(this));


            if (existingIndex != -1) {
                if (eventType == "remove") {
                    store.removeAt(existingIndex);
                } else {
                    let item = store.getAt(existingIndex);
                    item.set("data", newValue);
                }

            } else {
                let item = {
                    name: name,
                    language: language,
                    data: newValue,
                    type: type
                };
                store.add(item);
            }
        }.bind(this);


        if (this.grid == null) {
            if (this.dataProvider.getItemCount() < 1) {
                // default fields
                if (this.asset.data.type == "image") {
                    this.dataProvider.add({
                        name: "title",
                        type: "input",
                        language: "",
                        value: ""
                    });
                    this.dataProvider.add({
                        name: "alt",
                        type: "input",
                        language: "",
                        value: ""
                    });
                    this.dataProvider.add({
                        name: "copyright",
                        type: "input",
                        language: "",
                        value: ""
                    });
                }
            }

            var customKey = new Ext.form.TextField({
                name: 'key',
                emptyText: t('name'),
                enableKeyEvents: true,
                listeners: {
                    keyup: function (el) {
                        if (el.getValue().match(/[~]+/)) {
                            el.setValue(el.getValue().replace(/[~]/g, "---"));
                        }
                    }
                }
            });

            var supportedTypes = pimcore.helpers.getAssetMetadataDataTypes("custom");
            var typeStore = [];

            for (let i = 0; i < supportedTypes.length; i++) {
                let type = supportedTypes[i];
                typeStore.push([type, t(type)]);
            }

            var customType = new Ext.form.ComboBox({
                name: "type",
                valueField: "id",
                displayField:'name',
                store: typeStore,
                editable: false,
                triggerAction: 'all',
                mode: "local",
                width: 120,
                value: "input",
                emptyText: t('type')
            });

            var languagestore = [["",t("none")]];
            var websiteLanguages = pimcore.settings.websiteLanguages;
            var selectContent = "";
            for (let i = 0; i < websiteLanguages.length; i++) {
                selectContent = pimcore.available_languages[websiteLanguages[i]] + " [" + websiteLanguages[i] + "]";
                languagestore.push([websiteLanguages[i], selectContent]);
            }

            var customLanguage = new Ext.form.ComboBox({
                name: "language",
                store: languagestore,
                editable: false,
                triggerAction: 'all',
                mode: "local",
                width: 150,
                emptyText: t('language')
            });

            var modelName = 'pimcore.model.assetmetadata';
            if (!Ext.ClassManager.get(modelName)) {
                Ext.define(modelName, {
                        extend: 'Ext.data.Model',
                        fields: [
                            {
                                name: 'name',
                                convert: function (v, r) {
                                    return v.replace(/[~]/g, "---");
                                }
                            }, "type", {
                                name: "data",
                                convert: function (v, r) {
                                    let dataType = r.data.type;
                                    if (typeof pimcore.asset.metadata.tags[dataType].prototype.convertPredefinedGridData === "function") {
                                        v = pimcore.asset.metadata.tags[dataType].prototype.convertPredefinedGridData(v, r);
                                    }
                                    return v;
                                }
                            }, "language", "config"]
                    }
                );
            }


            let storeData = this.dataProvider.getDataAsArray();

            var store = new Ext.data.Store({
                model: modelName,
                data: storeData,
                listeners: {
                    update: function(store, record, operation, modifiedFieldNames, details, eOpts) {
                        let newData = record.data.data;
                        newData = pimcore.asset.metadata.tags[record.data.type].prototype.marshal(newData);
                        this.dataProvider.update(record.data, newData, this.grid.getId());
                    }.bind(this),
                    remove: function(store, records, index, isMove, eOpts ) {
                        for (let i = 0; i < records.length; i++) {
                            let record = records[i];
                            let key = this.dataProvider.buildKeyFromItem(record.data);
                            this.dataProvider.remove(record.data, this.grid.getId());
                        }
                    }.bind(this),
                    add: function(updateListener, store, records, index,  eOpts ) {
                        for (let i = 0; i < records.length; i++) {
                            let record = records[i];
                            let key = this.dataProvider.buildKeyFromItem(record.data);
                            // this.dataProvider.registerChangeListener(key, this.grid.getId(), updateListener);
                            this.dataProvider.update(record.data, record.data.data, this.grid.getId());
                        }
                    }.bind(this, updateListener)
                }
            });

            this.cellEditing = Ext.create('Ext.grid.plugin.CellEditing', {
                clicksToEdit: 1,
                listeners: {
                    beforeedit: function (editor, context, eOpts) {
                        //need to clear cached editors of cell-editing editor in order to
                        //enable different editors per row
                        editor.editors.each(function (e) {
                            try {
                                // complete edit, so the value is stored when hopping around with TAB
                                e.completeEdit();
                                Ext.destroy(e);
                            } catch (exception) {
                                // garbage collector was faster
                                // already destroyed
                            }
                        });

                        editor.editors.clear();
                    }
                }
            });

            let tbarItems = [
                {
                    xtype: "tbtext",
                    text: t('add') + " &nbsp;&nbsp;"
                }, customKey, customType, customLanguage, {
                    xtype: "button",
                    handler: this.addSetFromUserDefined.bind(this, customKey, customType, customLanguage),
                    iconCls: "pimcore_icon_add"
                }
            ];

            if (!this.config.hideAddPredefinedButton) {
                tbarItems.push({
                    xtype: "tbspacer",
                    width: 20
                });
                tbarItems.push("-");
                tbarItems.push({
                    xtype: "tbspacer",
                    width: 20
                });
                tbarItems.push({
                    xtype: "button",
                    text: t('add_predefined_metadata_definitions'),
                    handler: this.handleAddPredefinedDefinitions.bind(this),
                    iconCls: "pimcore_icon_add"
                });
            }

            this.grid = Ext.create('Ext.grid.Panel', {
                title: this.config.title ? this.config.title : t("custom_metadata"),
                autoScroll: true,
                region: "center",
                iconCls: this.config.hasOwnProperty('iconCls') ? this.config.iconCls : "pimcore_material_icon_metadata pimcore_material_icon",
                bodyCls: "pimcore_editable_grid",
                trackMouseOver: true,
                store: store,
                tbar: tbarItems,
                plugins: [
                    this.cellEditing
                ],
                columnLines: true,
                stripeRows: true,
                columns: {
                    items: [
                        {
                            text: t("type"),
                            dataIndex: 'type',
                            editable: false,
                            width: 40,
                            renderer: this.getTypeRenderer.bind(this),
                            sortable: true
                        },
                        {
                            text: t("name"),
                            dataIndex: 'name',
                            getEditor: function () {
                                return new Ext.form.TextField({
                                    allowBlank: false
                                });
                            },
                            renderer: Ext.util.Format.htmlEncode,
                            sortable: true,
                            width: 230
                        },
                        {
                            text: t('language'),
                            sortable: true,
                            dataIndex: "language",
                            getEditor: function () {
                                return new Ext.form.ComboBox({
                                    name: "language",
                                    store: languagestore,
                                    editable: false,
                                    listConfig: {minWidth: 200},
                                    triggerAction: 'all',
                                    mode: "local"
                                });
                            },
                            width: 80
                        },
                        {
                            text: t("value"),
                            dataIndex: 'data',
                            getEditor: this.getCellEditor.bind(this),
                            editable: true,
                            renderer: this.getCellRenderer.bind(this),
                            listeners: {
                                "mousedown": this.cellMousedown.bind(this)
                            },
                            flex: 1
                        },
                        {
                            xtype: 'actioncolumn',
                            menuText: t('open'),
                            width: 40,
                            items: [
                                {
                                    tooltip: t('open'),
                                    icon: "/bundles/pimcoreadmin/img/flat-color-icons/open_file.svg",
                                    handler: function (grid, rowIndex) {
                                        let rec = grid.getStore().getAt(rowIndex);
                                        pimcore.asset.metadata.tags[rec.get('type')].prototype.handleGridOpenAction(grid, rowIndex);
                                    }.bind(this),
                                    getClass: function (v, meta, rec) {
                                        return pimcore.asset.metadata.tags[rec.get('type')].prototype.getGridOpenActionVisibilityStyle();
                                    }
                                }
                            ]
                        },
                        {
                            xtype: 'actioncolumn',
                            menuText: t('delete'),
                            width: 40,
                            items: [{
                                tooltip: t('delete'),
                                icon: "/bundles/pimcoreadmin/img/flat-color-icons/delete.svg",
                                handler: function (grid, rowIndex) {
                                    grid.getStore().removeAt(rowIndex);
                                }.bind(this)
                            }]
                        }
                    ]
                }
            });

            this.grid.getView().on("refresh", this.updateRows.bind(this, "view-refresh"));
        }

        this.dataProvider.registerGlobalChangeListener(this.grid.getId(), updateListener);

        return this.grid;
    },

    updateRows: function (event) {
        var rows = Ext.get(this.grid.getEl().dom).query(".x-grid-row");

        for (let i = 0; i < rows.length; i++) {
            try {
                var data = this.grid.getStore().getAt(i).data;

                if (in_array(data.name, this.disallowedKeys)) {
                    Ext.get(rows[i]).addCls("pimcore_properties_hidden_row");
                }

                pimcore.asset.metadata.tags[data.type].prototype.updatePredefinedGridRow(this.grid, rows[i], data);
            } catch (e) {
                console.log(e);
            }
        }
    },

    getTypeRenderer: function (value, metaData, record, rowIndex, colIndex, store) {
        return '<div class="pimcore_icon_' + Ext.util.Format.htmlEncode(value) + ' pimcore_property_grid_type_column" name="' + Ext.util.Format.htmlEncode(record.data.name) + '">&nbsp;</div>';
    },

    getCellRenderer: function (value, metaData, record, rowIndex, colIndex, store) {
        var data = store.getAt(rowIndex).data;
        var type = data.type;
        return pimcore.asset.metadata.tags[type].prototype.getGridCellRenderer(value, metaData, record, rowIndex, colIndex, store);
    },

    addSetFromUserDefined: function (customKey, customType, customLanguage) {
        this.add(customKey.getValue(), customType.getValue(), false, customLanguage.getValue());
    },

    add: function (key, type, value, language) {

        var store = this.grid.getStore();

        // check for empty key & type
        if (key.length < 2 || type.length < 1) {
            Ext.MessageBox.alert(t("error"), t("name_and_key_must_be_defined"));
            return;
        }

        if (!value) {
            value = "";
        }

        if(!language) {
            language = "";
        }

        // check for duplicate name
        var duplicateIndex = store.findBy(function (record, id) {
            if (record.data.name.toLowerCase() == key.toLowerCase()) {
                if(String(record.data.language).toLowerCase() == language.toLowerCase()) {
                    return true;
                }
            }
            return false;
        });

        if (duplicateIndex >= 0) {
            Ext.MessageBox.alert(t("error"), t("name_already_in_use"));
            return;
        }

        store.add({
            name: key,
            data: value,
            type: type,
            language: language
        });
        this.grid.getView().refresh();
    },

    cellMousedown: function (grid, cell, rowIndex, cellIndex, e) {
        var store = grid.getStore();
        var record = store.getAt(rowIndex);
        pimcore.asset.metadata.tags[record.data.type].prototype.handleGridCellClick(grid, cell, rowIndex, cellIndex, e);
    },

    getCellEditor: function (record) {
        return pimcore.asset.metadata.tags[record.data.type].prototype.getGridCellEditor("custom", record);
    },

    commitChanges: function () {
        var store = this.grid.getStore();
        store.commitChanges();
    },

    handleAddPredefinedDefinitions: function() {

        Ext.Ajax.request({
            url: Routing.generate('pimcore_admin_settings_getpredefinedmetadata'),
            params: {
                type: "asset",
                subType: this.asset.type
            },
            success: this.doAddPredefinedDefinitions.bind(this)
        });
    },

    doAddPredefinedDefinitions: function (response) {
        var data = Ext.decode(response.responseText);
        data = data.data;
        var store = this.grid.getStore();
        var added = false;

        for (let i = 0; i < data.length; i++) {
            let item = data[i];
            let key = item.name || "";
            let language = item.language || "";

            if (!item.type) {
                continue;
            }

            var duplicateIndex = store.findBy(function (record, id) {
                if (record.data.name.toLowerCase() == key.toLowerCase()) {
                    if (String(record.data.language).toLowerCase() == language.toLowerCase()) {
                        return true;
                    }
                }
                return false;
            });

            if (duplicateIndex < 0) {
                let value = item.data;
                value = pimcore.asset.metadata.tags[item.type].prototype.unmarshal(value);

                let newRecord = {
                    name: key,
                    data: value,
                    type: item.type,
                    config: item.config,
                    language: language
                };

                store.add(newRecord);
                added = true;
            }
        }

        if (added) {
            this.grid.getView().refresh();
        }
    },

    getValues: function () {
        let values = this.dataProvider.getSubmitValues();
        let result = {
            values: values
        };

        return result;
    }
});