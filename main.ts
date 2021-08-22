import { App, Notice, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';
import {request} from 'https';
import {parseICS, FullCalendar} from 'ical';



interface WeeklyNoteSettings {
	templatePath: string;
	logsDir: string;
}

const DEFAULT_SETTINGS: WeeklyNoteSettings = {
	templatePath: "",
	logsDir: "",
}

export default class WeeklyNotePlugin extends Plugin {
	settings: WeeklyNoteSettings;
	cal: FullCalendar
	

	downloadICS() {
		console.log("jello")
		const req = request({
			hostname: 'calendar.google.com',
			port: 443,
			path: '/calendar/ical/maloney.a12%40gmail.com/private-85bf3e930ec56fc2438e9ec5962331fb/basic.ics',
			method: 'GET'
		}, res => {
			console.log(`statusCode: ${res.statusCode}`)
			let data = ''

			res.on('data', d => {
				data += d
			})

			res.on('end', () => {
				console.log("parsing")
				this.cal = parseICS(data)
				console.log(this.cal)
				console.log("done")
			});
		})

		req.on('error', error => {
			console.error(error)
		})

		req.end()
	}

	getFileByPath(path: string): TFile {
		return this.app.vault.getFiles().find((file) => {return file.path == path})
	}

	//File is named for month.numbered-week.year
	getFileName(d: Date): string {
		//how to get numbered week (if there is a month change
		//mid week we consider this week part of the last month)
		//find date of this weeks monday, count number of weeks. 
		
		let MONDAY = 1
		while (d.getDay() != MONDAY) {
			d.setDate(d.getDate() - 1)
		}  
		let week = Math.floor(d.getDate()/7) + 1
		let month =  d.getMonth() + 1
		let year = d.getFullYear()
		return this.settings.logsDir + month + "." + week + "." + year + ".md"
	}

	async getUnfinishedTodos(fileName: string): Promise<string[]> {
		let lastWeekFile = this.getFileByPath(fileName)
		if (lastWeekFile == undefined) {
			new Notice("couldn't find last weeks note, " + fileName)
			return [""]
		}

		let lines = (await this.app.vault.read(lastWeekFile)).split(/\r?\n/)
		return lines.filter((line) => {return line.includes("- [ ]")})
	}

	async fillTemplate(todos: string): Promise<string> {
		let TODO_TEMPLATE_TAG = "{{TODO}}"
		if (todos == "") {
			todos = "- [ ] placeholder"
		}

		if (this.settings.templatePath == "") {
			return todos
		}
		
		if (this.app.vault.getAbstractFileByPath(this.settings.templatePath) == null) {
			new Notice("cant find template " + this.settings.templatePath)
			return todos
		}

		let templateFile = this.getFileByPath(this.settings.templatePath)
		let template = await this.app.vault.read(templateFile)
		
		if (!template.includes(TODO_TEMPLATE_TAG)) {
			new Notice("Can't find "+ TODO_TEMPLATE_TAG +" tag in template")
			return template + todos
		}

		return template.replace(TODO_TEMPLATE_TAG, todos)
	}

	async onload() {
		await this.loadSettings();
		this.downloadICS()

		this.addRibbonIcon('document', 'Weekly Note', async () => {
			let name = this.getFileName(new Date()) 
			if (this.app.vault.getAbstractFileByPath(name) == null) {
				//get last weeks un finished todos
				let lastWeek = new Date()
				lastWeek.setDate(lastWeek.getDate() - 7)
				let lastweeksFileName = this.getFileName(lastWeek) 
				let todos = await this.getUnfinishedTodos(lastweeksFileName)
				let content = await this.fillTemplate(todos.join("\n"))
				await this.app.vault.create(name, content)
			}
			let file = this.getFileByPath(name)
			await this.app.workspace.activeLeaf.openFile(file)
		});


		this.addSettingTab(new SettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: WeeklyNotePlugin;

	constructor(app: App, plugin: WeeklyNotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Weekly Note Settings'});

		new Setting(containerEl)
			.setName('Weekly Note Template')
			.addText(text => text
				.setPlaceholder('path to template')
				.setValue(this.plugin.settings.templatePath)
				.onChange(async (value) => {
					this.plugin.settings.templatePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Weekly Note Directory')
			.addText(text => text
				.setPlaceholder('path to dir')
				.setValue(this.plugin.settings.logsDir)
				.onChange(async (value) => {
					this.plugin.settings.logsDir = value;
					await this.plugin.saveSettings();
				}));
	}
}