import { Component } from '@angular/core';
import { 
  IonContent, 
  IonItem, 
  IonInput, 
  IonIcon, 
  IonButton 
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { mailOutline, lockClosedOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  imports: [
    IonContent, 
    IonItem, 
    IonInput, 
    IonIcon, 
    IonButton
  ],
})
export class loginPage {
  constructor() {
    addIcons({ mailOutline, lockClosedOutline });
  }
}